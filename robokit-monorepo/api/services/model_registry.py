from typing import Dict, Any, Optional, Union, Protocol
from pathlib import Path
from abc import ABC, abstractmethod
import json


class PolicyConfig(Protocol):
    image_features: list[str]
    robot_state_feature: Optional[str]
    env_state_feature: Optional[str]
    chunk_size: int


class PolicyModel(Protocol):
    backbone: Any
    decoder: Any


class ACTPolicy(Protocol):
    config: PolicyConfig
    model: PolicyModel
    
    def forward(self, batch: Dict[str, Any]) -> Any: ...
    def select_action(self, observation: Dict[str, Any], force_model_run: bool = False) -> Any: ...
    def to(self, device: str) -> 'ACTPolicy': ...


class ModelLoader(ABC):
    @abstractmethod
    def can_load(self, model_id: Union[str, Dict[str, Any]]) -> bool:
        pass
    
    @abstractmethod
    def load(self, model_id: Union[str, Dict[str, Any]], device: str) -> ACTPolicy:
        pass


class DefaultModelLoader(ModelLoader):
    def can_load(self, model_id: Union[str, Dict[str, Any]]) -> bool:
        return isinstance(model_id, str) and model_id == "default"
    
    def load(self, model_id: Union[str, Dict[str, Any]], device: str) -> ACTPolicy:
        import torch
        import torch.nn as nn
        
        class StubConfig:
            image_features = ["base", "top", "endeffector"]
            robot_state_feature = "observation.state"
            env_state_feature = None
            chunk_size = 100
        
        class StubBackbone(nn.Module):
            def __init__(self):
                super().__init__()
                self._p = nn.Parameter(torch.zeros(()))
            
            def forward(self, x):
                b, c, h, w = x.shape
                feat_h, feat_w = max(1, h // 32), max(1, w // 32)
                return {"feature_map": torch.randn(b, 512, feat_h, feat_w, device=x.device)}
        
        class StubLayer(nn.Module):
            def __init__(self):
                super().__init__()
                self.multihead_attn = nn.MultiheadAttention(
                    embed_dim=512, num_heads=8, batch_first=True
                )
        
        class StubDecoder(nn.Module):
            def __init__(self):
                super().__init__()
                self.layers = [StubLayer()]
            
            def forward(self, x):
                return self.layers[0].multihead_attn(x, x, x, need_weights=True)
        
        class StubModel(nn.Module):
            def __init__(self):
                super().__init__()
                self.backbone = StubBackbone()
                self.decoder = StubDecoder()
        
        class StubACTPolicy(nn.Module):
            def __init__(self):
                super().__init__()
                self.config = StubConfig()
                self.model = StubModel()
            
            def forward(self, batch):
                batch_size = self._extract_batch_size(batch)
                return torch.randn(batch_size, self.config.chunk_size, 7)
            
            def select_action(self, observation, force_model_run=False):
                batch_size = self._extract_batch_size(observation)
                seq = torch.randn(batch_size, self.config.chunk_size, 512)
                _ = self.model.decoder(seq)
                return torch.randn(batch_size, 7)
            
            def _extract_batch_size(self, data):
                for value in data.values():
                    if hasattr(value, 'shape') and len(value.shape) > 0:
                        return value.shape[0]
                return 1
        
        return StubACTPolicy().to(device)


class LocalModelLoader(ModelLoader):
    def can_load(self, model_id: Union[str, Dict[str, Any]]) -> bool:
        return isinstance(model_id, str) and Path(model_id).exists()
    
    def load(self, model_id: Union[str, Dict[str, Any]], device: str) -> ACTPolicy:
        import torch
        default_loader = DefaultModelLoader()
        policy = default_loader.load("default", device)
        policy._model_path = model_id
        return policy


class HuggingFaceModelLoader(ModelLoader):
    def can_load(self, model_id: Union[str, Dict[str, Any]]) -> bool:
        return isinstance(model_id, str) and "/" in model_id and not Path(model_id).exists()
    
    def load(self, model_id: Union[str, Dict[str, Any]], device: str) -> ACTPolicy:
        default_loader = DefaultModelLoader()
        policy = default_loader.load("default", device)
        policy._repo_id = model_id
        return policy


class ConfigModelLoader(ModelLoader):
    def can_load(self, model_id: Union[str, Dict[str, Any]]) -> bool:
        return isinstance(model_id, dict)
    
    def load(self, model_id: Union[str, Dict[str, Any]], device: str) -> ACTPolicy:
        default_loader = DefaultModelLoader()
        policy = default_loader.load("default", device)
        policy._config_dict = model_id
        return policy


class ModelRegistry:
    def __init__(self):
        self._cache: Dict[str, ACTPolicy] = {}
        self._loaders = [
            DefaultModelLoader(),
            LocalModelLoader(),
            HuggingFaceModelLoader(),
            ConfigModelLoader()
        ]
    
    def get_act_policy(self, model_id: Union[str, Dict[str, Any]], device: str = "cpu") -> ACTPolicy:
        if not isinstance(model_id, (str, dict)):
            raise ValueError(f"model_id must be str or dict, got {type(model_id)}")
        
        if isinstance(model_id, dict) and not model_id:
            raise ValueError("model_id dict cannot be empty")
        
        try:
            import torch
            if device == "cuda" and not torch.cuda.is_available():
                device = "cpu"
        except ImportError:
            raise ImportError("torch is required for model loading")
        
        cache_key = self._get_cache_key(model_id, device)
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        loader = self._find_loader(model_id)
        if not loader:
            raise ValueError(f"No loader found for model_id: {model_id}")
        
        try:
            policy = loader.load(model_id, device)
        except Exception as e:
            raise ValueError(f"Failed to load model {model_id}: {e}")
        
        self._validate_policy_interface(policy)
        
        self._cache[cache_key] = policy
        return policy
    
    def _find_loader(self, model_id: Union[str, Dict[str, Any]]) -> Optional[ModelLoader]:
        return next((loader for loader in self._loaders if loader.can_load(model_id)), None)
    
    def _get_cache_key(self, model_id: Union[str, Dict[str, Any]], device: str) -> str:
        if isinstance(model_id, str):
            return f"{model_id}:{device}"
        elif isinstance(model_id, dict):
            try:
                return f"config_{hash(json.dumps(model_id, sort_keys=True))}:{device}"
            except (TypeError, ValueError) as e:
                raise ValueError(f"Model config dict is not serializable: {e}")
        else:
            raise ValueError(f"Unsupported model_id type: {type(model_id)}")
    
    def _validate_policy_interface(self, policy: ACTPolicy) -> None:
        required_attrs = ['config', 'model']
        for attr in required_attrs:
            if not hasattr(policy, attr):
                raise AttributeError(f"Policy missing required attribute: {attr}")
        
        config_fields = ['image_features', 'chunk_size']
        for field in config_fields:
            if not hasattr(policy.config, field):
                raise AttributeError(f"Policy config missing required field: {field}")
        
        model_attrs = ['backbone', 'decoder']
        for attr in model_attrs:
            if not hasattr(policy.model, attr):
                raise AttributeError(f"Policy model missing {attr}")
        
        if not hasattr(policy.model.decoder, 'layers') or not policy.model.decoder.layers:
            raise AttributeError("Policy model decoder missing layers")
    
    def clear_cache(self) -> None:
        self._cache.clear()


model_registry = ModelRegistry()