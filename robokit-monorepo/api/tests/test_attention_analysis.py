import pytest
from unittest.mock import Mock, patch
import torch
import numpy as np

from schemas.dataset import AttentionAnalysisParams
from services.model_registry import ModelRegistry
from services.attention_wrapper import ACTPolicyWithAttention


class TestAttentionAnalysisParams:
    def test_valid_params(self):
        params = AttentionAnalysisParams(
            model="default",
            episode_index=0,
            stride=2,
            max_frames=100,
            overlay_alpha=0.5
        )
        assert params.model == "default"
        assert params.episode_index == 0
        assert params.stride == 2
        assert params.max_frames == 100
        assert params.overlay_alpha == 0.5

    def test_param_serialization(self):
        params = AttentionAnalysisParams(model="test")
        params_dict = params.model_dump()
        assert "model" in params_dict
        assert "episode_index" in params_dict
        
        params2 = AttentionAnalysisParams.model_validate(params_dict)
        assert params2.model == params.model
    
    def test_invalid_specific_decoder_token_index(self):
        with pytest.raises(ValueError, match="specific_decoder_token_index must be non-negative"):
            AttentionAnalysisParams(specific_decoder_token_index=-1)
    
    def test_valid_specific_decoder_token_index_none(self):
        params = AttentionAnalysisParams(specific_decoder_token_index=None)
        assert params.specific_decoder_token_index is None
    
    def test_valid_specific_decoder_token_index_positive(self):
        params = AttentionAnalysisParams(specific_decoder_token_index=5)
        assert params.specific_decoder_token_index == 5


class TestModelRegistry:
    def setUp(self):
        self.registry = ModelRegistry()
        self.registry.clear_cache()

    def test_get_default_policy(self):
        with patch('torch.cuda.is_available', return_value=False):
            policy = self.registry.get_act_policy("default", device="cpu")
            
            assert hasattr(policy, 'config')
            assert hasattr(policy, 'model')
            assert hasattr(policy.config, 'image_features')
            assert hasattr(policy.config, 'chunk_size')

    def test_policy_caching(self):
        with patch('torch.cuda.is_available', return_value=False):
            policy1 = self.registry.get_act_policy("default", device="cpu")
            policy2 = self.registry.get_act_policy("default", device="cpu")
            assert policy1 is policy2

    def test_invalid_model_type(self):
        with pytest.raises(ValueError, match="model_id must be str or dict"):
            self.registry.get_act_policy(123)
    
    def test_empty_dict_model(self):
        with pytest.raises(ValueError, match="model_id dict cannot be empty"):
            self.registry.get_act_policy({})
    
    def test_non_serializable_dict(self):
        import datetime
        with pytest.raises(ValueError, match="Model config dict is not serializable"):
            self.registry.get_act_policy({"key": datetime.datetime.now()})


class TestACTPolicyWithAttention:
    def create_mock_policy(self):
        policy = Mock()
        
        config = Mock()
        config.image_features = ["base", "top"]
        config.robot_state_feature = "observation.state" 
        config.chunk_size = 100
        policy.config = config
        
        model = Mock()
        backbone = Mock()
        backbone.parameters.return_value = [torch.tensor([1.0])]
        
        def backbone_forward(x):
            b, c, h, w = x.shape
            return {"feature_map": torch.randn(b, 512, h//32, w//32)}
        
        backbone.side_effect = backbone_forward
        model.backbone = backbone
        
        decoder = Mock()
        layer = Mock()
        multihead_attn = Mock()
        layer.multihead_attn = multihead_attn
        decoder.layers = [layer]
        model.decoder = decoder
        
        policy.model = model
        
        def select_action_mock(obs, force_model_run=False):
            return torch.randn(1, 7)
        
        policy.select_action = select_action_mock
        
        return policy

    def test_wrapper_initialization(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        assert wrapper.policy is policy
        assert wrapper.config is policy.config
        assert wrapper.attention_mapper.num_images == 2

    def test_select_action_with_attention(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        observation = {
            "base": torch.randn(1, 3, 224, 224),
            "top": torch.randn(1, 3, 224, 224),
            "observation.state": torch.randn(1, 7)
        }
        
        with patch.object(wrapper.attention_capture.target_layer, 'register_forward_hook') as mock_hook:
            mock_handle = Mock()
            mock_hook.return_value = mock_handle
            
            action, attention_maps = wrapper.select_action(observation)
            
            assert action is not None
            assert isinstance(attention_maps, list)
            assert len(attention_maps) == 2

    def test_image_extraction(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        observation = {
            "base": torch.randn(1, 3, 224, 224),
            "top": torch.randn(1, 3, 224, 224),
            "missing": None
        }
        
        images = wrapper._extract_images(observation)
        assert len(images) == 2
        assert images[0] is not None
        assert images[1] is not None

    def test_attention_visualization(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        wrapper.last_attention_maps = [
            np.random.rand(10, 10),
            np.random.rand(10, 10)
        ]
        wrapper.last_proprio_attention = 0.5
        
        images = [
            torch.randn(3, 224, 224),
            torch.randn(3, 224, 224)
        ]
        
        with patch('services.attention_wrapper.AttentionVisualizer.create_overlays') as mock_create:
            mock_create.return_value = [np.random.rand(224, 224, 3) * 255, np.random.rand(224, 224, 3) * 255]
            
            visualizations = wrapper.visualize_attention(images=images)
            
            assert len(visualizations) == 2
            mock_create.assert_called_once()
    
    def test_select_action_no_attention_captured(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        observation = {
            "base": torch.randn(1, 3, 224, 224),
            "top": torch.randn(1, 3, 224, 224),
            "observation.state": torch.randn(1, 7)
        }
        
        # Mock the hook to not capture any attention
        with patch.object(wrapper.attention_capture, 'get_weights', side_effect=RuntimeError("No attention weights were captured")):
            with pytest.raises(RuntimeError, match="Failed to extract attention weights"):
                wrapper.select_action(observation)
    
    def test_invalid_image_tensor(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        # Test with non-tensor image
        observation = {
            "base": "not_a_tensor",
            "top": torch.randn(1, 3, 224, 224)
        }
        
        with pytest.raises(ValueError, match="Image 0 is not a tensor"):
            wrapper.select_action(observation)
    
    def test_invalid_tensor_dimensions(self):
        policy = self.create_mock_policy()
        wrapper = ACTPolicyWithAttention(policy)
        
        # Test with wrong dimensions
        observation = {
            "base": torch.randn(224),  # 1D tensor
            "top": torch.randn(1, 3, 224, 224)
        }
        
        with pytest.raises(ValueError, match="Image 0 has invalid dimensions"):
            wrapper.select_action(observation)


class TestAttentionAnalysisIntegration:
    def test_full_attention_analysis_workflow(self):
        from api.v1.endpoints.datasets import analyze_attention_background
        from services.model_registry import model_registry
        from schemas.dataset import AttentionAnalysisParams
        import asyncio
        
        # Mock the model registry to return our test stub
        with patch.object(model_registry, 'get_act_policy') as mock_get_policy:
            mock_policy = Mock()
            mock_config = Mock()
            mock_config.image_features = ["base", "top"]
            mock_config.robot_state_feature = "observation.state"
            mock_config.chunk_size = 100
            mock_policy.config = mock_config
            mock_policy.model = Mock()
            mock_policy.model.backbone = Mock()
            mock_policy.model.backbone.parameters.return_value = [torch.tensor([1.0])]
            mock_policy.model.decoder = Mock()
            mock_policy.model.decoder.layers = [Mock()]
            mock_get_policy.return_value = mock_policy
            
            # Mock the attention service dependencies
            with patch('api.v1.endpoints.datasets.get_db_context') as mock_db_context:
                mock_db = Mock()
                mock_db_context.return_value.__enter__.return_value = mock_db
                
                with patch('services.attention_service.DatasetService') as mock_dataset_service:
                    mock_dataset = Mock()
                    mock_dataset.source = {"type": "huggingface", "repo_id": "test/repo", "revision": "main"}
                    mock_dataset.format_type = "lerobot"
                    mock_dataset_service.get_dataset.return_value = mock_dataset
                    
                    with patch('services.attention_service.DatasetMetadata') as mock_metadata:
                        mock_metadata.get_lerobot_metadata.return_value = (30.0, ["base", "top"])
                        
                        with patch('services.hf_utils.safe_hf_download') as mock_download:
                            mock_download.return_value = "/fake/path.parquet"
                            
                            with patch('pyarrow.parquet.read_table') as mock_read_table:
                                import pandas as pd
                                mock_df = pd.DataFrame({
                                    'timestamp': [0.0, 0.033, 0.066],
                                    'observation.state': [[1,2,3,4,5,6,7], [1,2,3,4,5,6,7], [1,2,3,4,5,6,7]]
                                })
                                mock_table = Mock()
                                mock_table.to_pandas.return_value = mock_df
                                mock_read_table.return_value = mock_table
                                
                                with patch('services.rerun_service.VideoLoader') as mock_video_loader:
                                    mock_video_caps = {"base": Mock(), "top": Mock()}
                                    mock_video_loader.load_episode_videos.return_value = mock_video_caps
                                    mock_video_loader.read_frame.return_value = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
                                    
                                    with patch('rerun as rr') as mock_rerun:
                                        # Test the integration
                                        params = {
                                            "model": "default",
                                            "episode_index": 0,
                                            "stride": 1,
                                            "max_frames": 3
                                        }
                                        
                                        async def run_test():
                                            result = await analyze_attention_background(
                                                dataset_id=1,
                                                parameters=params,
                                                job_id=1
                                            )
                                            return result
                                        
                                        result = asyncio.run(run_test())
                                        
                                        # Verify result structure
                                        assert "full_result" in result
                                        assert "summary" in result
                                        assert "rrd_url" in result["full_result"]
                                        assert "frames_written" in result["full_result"]
                                        assert result["full_result"]["frames_written"] > 0


@pytest.fixture(autouse=True)
def clear_model_cache():
    registry = ModelRegistry()
    registry.clear_cache()
    yield
    registry.clear_cache()