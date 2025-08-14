import numpy as np
import cv2
from typing import List, Dict, Tuple, Optional, Any, Protocol
from dataclasses import dataclass


class PolicyProtocol(Protocol):
    config: Any
    model: Any
    
    def select_action(self, observation: Dict[str, Any], force_model_run: bool = False) -> Any: ...


@dataclass
class AttentionConfig:
    specific_decoder_token_index: Optional[int] = None
    global_normalize: bool = True
    capture_layer_index: int = -1


class AttentionCapture:
    def __init__(self, target_layer):
        self.target_layer = target_layer
        self.captured_weights = []
        self.hook_handle = None
    
    def start_capture(self):
        def attention_hook(module, input_args, output_tuple):
            if isinstance(output_tuple, tuple) and len(output_tuple) > 1:
                attn_weights = output_tuple[1]
            else:
                attn_weights = getattr(module, 'attn_weights', None)
            
            if attn_weights is not None:
                self.captured_weights.append(attn_weights.detach().cpu())
        
        self.hook_handle = self.target_layer.register_forward_hook(attention_hook)
    
    def stop_capture(self):
        if self.hook_handle:
            self.hook_handle.remove()
            self.hook_handle = None
    
    def get_weights(self):
        if not self.captured_weights:
            raise RuntimeError("No attention weights were captured during forward pass")
        return self.captured_weights[0]
    
    def clear(self):
        self.captured_weights.clear()


class AttentionMapper:
    def __init__(self, config: AttentionConfig, policy_config: Any):
        self.config = config
        self.policy_config = policy_config
        self.num_images = len(policy_config.image_features) if hasattr(policy_config, 'image_features') else 0
    
    def map_attention_to_images(self, attention, image_spatial_shapes) -> Tuple[List[np.ndarray], float]:
        import torch
        
        if attention.dim() == 4:
            attention = attention.mean(dim=1)
        elif attention.dim() != 3:
            raise ValueError(f"Unexpected attention dimension: {attention.shape}")

        n_prefix_tokens = 1
        proprio_token_idx = None
        if hasattr(self.policy_config, 'robot_state_feature') and self.policy_config.robot_state_feature:
            proprio_token_idx = n_prefix_tokens
            n_prefix_tokens += 1
        if hasattr(self.policy_config, 'env_state_feature') and self.policy_config.env_state_feature:
            n_prefix_tokens += 1

        proprio_attention = self._extract_proprio_attention(attention, proprio_token_idx)
        attention_maps = self._extract_image_attention_maps(attention, image_spatial_shapes, n_prefix_tokens)
        
        if self.config.global_normalize:
            attention_maps, proprio_attention = self._global_normalize(attention_maps, proprio_attention)
        
        return attention_maps, proprio_attention
    
    def _extract_proprio_attention(self, attention, proprio_token_idx):
        if proprio_token_idx is None:
            return 0.0
        
        if self.config.specific_decoder_token_index is not None:
            if 0 <= self.config.specific_decoder_token_index < attention.shape[1]:
                proprio_attention_tensor = attention[:, self.config.specific_decoder_token_index, proprio_token_idx]
            else:
                proprio_attention_tensor = attention[:, :, proprio_token_idx].mean(dim=1)
        else:
            proprio_attention_tensor = attention[:, :, proprio_token_idx].mean(dim=1)

        return float(proprio_attention_tensor[0].cpu().numpy())
    
    def _extract_image_attention_maps(self, attention, image_spatial_shapes, n_prefix_tokens):
        raw_maps = []
        current_src_token_idx = n_prefix_tokens
        
        for h_feat, w_feat in image_spatial_shapes:
            if h_feat == 0 or w_feat == 0:
                raw_maps.append(None)
                continue

            num_img_tokens = h_feat * w_feat
            start_idx = current_src_token_idx
            end_idx = start_idx + num_img_tokens
            current_src_token_idx = end_idx

            attention_to_img_features = attention[:, :, start_idx:end_idx]

            if self.config.specific_decoder_token_index is not None:
                if 0 <= self.config.specific_decoder_token_index < attention_to_img_features.shape[1]:
                    img_attn_tensor = attention_to_img_features[:, self.config.specific_decoder_token_index, :]
                else:
                    img_attn_tensor = attention_to_img_features.mean(dim=1)
            else:
                img_attn_tensor = attention_to_img_features.mean(dim=1)

            if img_attn_tensor.shape[1] != num_img_tokens:
                raw_maps.append(None)
                continue

            try:
                img_attn_map_1d = img_attn_tensor[0]
                img_attn_map_2d = img_attn_map_1d.reshape(h_feat, w_feat)
                raw_maps.append(img_attn_map_2d.cpu().numpy())
            except RuntimeError:
                raw_maps.append(None)

        return raw_maps
    
    def _global_normalize(self, attention_maps, proprio_attention):
        global_min = float('inf')
        global_max = float('-inf')
        
        if proprio_attention is not None:
            global_min = min(global_min, proprio_attention)
            global_max = max(global_max, proprio_attention)

        for raw_map in attention_maps:
            if raw_map is not None:
                global_min = min(global_min, raw_map.min())
                global_max = max(global_max, raw_map.max())

        if global_max <= global_min:
            return attention_maps, 0.0

        normalized_maps = []
        for raw_map in attention_maps:
            if raw_map is None:
                normalized_maps.append(None)
            else:
                normalized_map = (raw_map - global_min) / (global_max - global_min)
                normalized_maps.append(normalized_map)

        normalized_proprio = (proprio_attention - global_min) / (global_max - global_min)
        return normalized_maps, normalized_proprio


class AttentionVisualizer:
    @staticmethod
    def create_overlays(
        images: List[Any],
        attention_maps: List[np.ndarray],
        proprio_attention: float,
        use_rgb: bool = False,
        overlay_alpha: float = 0.5,
        show_proprio_border: bool = True,
        proprio_border_width: int = 15
    ) -> List[np.ndarray]:
        visualizations = []
        
        for img, attn_map in zip(images, attention_maps):
            if img is None or attn_map is None:
                visualizations.append(None)
                continue
            
            img_np = AttentionVisualizer._tensor_to_numpy(img)
            vis = AttentionVisualizer._create_attention_overlay(
                img_np, attn_map, use_rgb, overlay_alpha
            )
            
            if show_proprio_border and proprio_attention > 0:
                vis = AttentionVisualizer._add_proprio_border(
                    vis, proprio_attention, use_rgb, proprio_border_width
                )
            
            visualizations.append(vis)
        
        return visualizations
    
    @staticmethod
    def _tensor_to_numpy(img):
        if hasattr(img, 'cpu'):
            if img.dim() == 4:
                img = img.squeeze(0)
            img_np = img.permute(1, 2, 0).cpu().numpy()
            if img_np.max() > 1.0:
                img_np = img_np / 255.0
        else:
            img_np = img
        return img_np
    
    @staticmethod
    def _create_attention_overlay(img_np, attn_map, use_rgb, overlay_alpha):
        h, w = img_np.shape[:2]
        attn_map_resized = cv2.resize(attn_map, (w, h))
        
        heatmap = cv2.applyColorMap(np.uint8(255 * attn_map_resized), cv2.COLORMAP_JET)
        if use_rgb:
            heatmap = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)
        
        return cv2.addWeighted(
            np.uint8(255 * img_np), 1 - overlay_alpha,
            heatmap, overlay_alpha, 0
        )
    
    @staticmethod
    def _add_proprio_border(vis, proprio_attention, use_rgb, border_width):
        h, w = vis.shape[:2]
        border_intensity = int(255 * proprio_attention)
        border_color = (border_intensity, 0, border_intensity)
        
        cv2.rectangle(vis, (0, 0), (w-1, h-1), border_color, border_width)
        
        text = f"Proprio: {proprio_attention:.3f}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 2
        
        (text_width, text_height), _ = cv2.getTextSize(text, font, font_scale, thickness)
        cv2.rectangle(vis, (5, 5), (5 + text_width + 10, 5 + text_height + 10), (0, 0, 0), -1)
        cv2.putText(vis, text, (10, 5 + text_height), font, font_scale, (255, 255, 255), thickness)
        
        return vis


class ACTPolicyWithAttention:
    def __init__(self, policy: PolicyProtocol, specific_decoder_token_index: Optional[int] = None):
        self.policy = policy
        self.config = policy.config
        
        # Create attention config first so it's available for validation
        self.attention_config = AttentionConfig(specific_decoder_token_index=specific_decoder_token_index)
        
        self._validate_policy_structure()
        
        self.attention_mapper = AttentionMapper(self.attention_config, self.config)
        self.attention_capture = AttentionCapture(self.policy.model.decoder.layers[-1].multihead_attn)
        
        self.last_observation = None
        self.last_attention_maps = None
        self.last_proprio_attention = 0.0
    
    def _validate_policy_structure(self):
        required_attrs = [
            ('policy.model', self.policy.model),
            ('policy.model.decoder', getattr(self.policy.model, 'decoder', None)),
            ('policy.model.decoder.layers', getattr(getattr(self.policy.model, 'decoder', None), 'layers', None))
        ]
        
        for attr_name, attr_value in required_attrs:
            if attr_value is None:
                raise AttributeError(f"Policy missing {attr_name}")
        
        if not self.policy.model.decoder.layers:
            raise AttributeError("Policy decoder has no layers")
        
        if self.attention_config.specific_decoder_token_index is not None:
            if not hasattr(self.config, 'chunk_size'):
                raise AttributeError("Policy config missing chunk_size")
            
            if not (0 <= self.attention_config.specific_decoder_token_index < self.config.chunk_size):
                raise ValueError(f"Invalid decoder token index: {self.attention_config.specific_decoder_token_index}")
    
    def select_action(self, observation: Dict[str, Any]) -> Tuple[Any, List[np.ndarray]]:
        import torch
        
        self.last_observation = observation.copy()
        
        images = self._extract_images(observation)
        image_spatial_shapes = self._get_image_spatial_shapes(images)
        
        self.attention_capture.clear()
        self.attention_capture.start_capture()
        
        try:
            with torch.inference_mode():
                if hasattr(self.policy, 'select_action'):
                    action = self.policy.select_action(observation, force_model_run=True)
                else:
                    action = self.policy(observation)
        finally:
            self.attention_capture.stop_capture()
        
        try:
            attention_weights = self.attention_capture.get_weights()
            attention_maps, proprio_attention = self.attention_mapper.map_attention_to_images(
                attention_weights, image_spatial_shapes
            )
            self.last_attention_maps = attention_maps
            self.last_proprio_attention = proprio_attention
        except RuntimeError as e:
            raise RuntimeError(f"Failed to extract attention weights: {e}")
        
        return action, attention_maps

    def _extract_images(self, observation: Dict[str, Any]) -> List[Any]:
        images = []
        if hasattr(self.config, 'image_features'):
            for key in self.config.image_features:
                images.append(observation.get(key))
        return images
    
    def _get_image_spatial_shapes(self, images: List[Any]) -> List[Tuple[int, int]]:
        import torch
        
        spatial_shapes = []
        for i, img_tensor in enumerate(images):
            if img_tensor is None:
                spatial_shapes.append((0, 0))
                continue
            
            if not hasattr(img_tensor, 'dim'):
                raise ValueError(f"Image {i} is not a tensor, got: {type(img_tensor)}")
                
            with torch.no_grad():
                if img_tensor.dim() == 3:
                    img_tensor_batched = img_tensor.unsqueeze(0)
                elif img_tensor.dim() == 4:
                    img_tensor_batched = img_tensor
                else:
                    raise ValueError(f"Image {i} has invalid dimensions: {img_tensor.dim()}, expected 3 or 4")

                try:
                    device = next(self.policy.model.backbone.parameters()).device
                except StopIteration:
                    device = torch.device('cpu')
                
                try:
                    img_tensor_batched = img_tensor_batched.to(device)
                except Exception as e:
                    raise RuntimeError(f"Failed to move image {i} to device: {e}")

                try:
                    feature_map_dict = self.policy.model.backbone(img_tensor_batched)
                except Exception as e:
                    raise RuntimeError(f"Backbone forward pass failed for image {i}: {e}")
                
                if "feature_map" not in feature_map_dict:
                    raise KeyError(f"Backbone did not return 'feature_map' key for image {i}")
                
                feature_map = feature_map_dict["feature_map"]
                if feature_map.dim() != 4:
                    raise ValueError(f"Feature map for image {i} has invalid dimensions: {feature_map.dim()}, expected 4")
                
                h, w = feature_map.shape[2], feature_map.shape[3]
                if h <= 0 or w <= 0:
                    raise ValueError(f"Invalid feature map spatial dimensions for image {i}: {h}x{w}")
                
                spatial_shapes.append((h, w))

        return spatial_shapes
    
    def visualize_attention(self, 
                          images: Optional[List[Any]] = None, 
                          attention_maps: Optional[List[np.ndarray]] = None, 
                          observation: Optional[Dict[str, Any]] = None,
                          use_rgb: bool = False,
                          overlay_alpha: float = 0.5,
                          show_proprio_border: bool = True,
                          proprio_border_width: int = 15) -> List[np.ndarray]:
        if images is None:
            if observation is not None:
                images = self._extract_images(observation)
            elif self.last_observation is not None:
                images = self._extract_images(self.last_observation)
            else:
                raise ValueError("No images provided and no stored observation available")
        
        if attention_maps is None:
            if self.last_attention_maps is not None:
                attention_maps = self.last_attention_maps
            else:
                raise ValueError("No attention maps provided and no stored attention maps available")

        return AttentionVisualizer.create_overlays(
            images, attention_maps, self.last_proprio_attention,
            use_rgb, overlay_alpha, show_proprio_border, proprio_border_width
        )
    
    def __getattr__(self, name):
        # __getattr__ is only called for attributes that don't exist
        # Try to get from the wrapped policy
        try:
            return getattr(self.policy, name)
        except AttributeError:
            raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")