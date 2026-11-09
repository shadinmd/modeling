"""
Model and tokenizer initialization utilities for LFM3-1.7B.
"""

import sys
from typing import Optional, Tuple
import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, PreTrainedModel, PreTrainedTokenizer

from src.config import AppConfig


def get_optimal_device_and_dtype(preferred_dtype: str = "bfloat16") -> Tuple[str, torch.dtype]:
    """Detect platform hardware (CUDA, MPS, CPU) and pick compatible torch dtype."""
    if torch.cuda.is_available():
        device = "cuda"
        dtype = torch.bfloat16 if (preferred_dtype == "bfloat16" and torch.cuda.is_bf16_supported()) else torch.float16
    elif torch.backends.mps.is_available():
        device = "mps"
        # Modern PyTorch on macOS supports bfloat16/float16 on MPS
        if preferred_dtype == "bfloat16":
            dtype = torch.bfloat16
        elif preferred_dtype == "float16":
            dtype = torch.float16
        else:
            dtype = torch.float32
    else:
        device = "cpu"
        dtype = torch.bfloat16 if preferred_dtype == "bfloat16" else torch.float32

    return device, dtype


def load_tokenizer(
    model_id: str,
    trust_remote_code: bool = True
) -> PreTrainedTokenizer:
    """Load and configure tokenizer for LFM3."""
    print(f"Loading tokenizer from: {model_id}...")
    tokenizer = AutoTokenizer.from_pretrained(
        model_id,
        trust_remote_code=trust_remote_code,
        use_fast=True,
    )

    if tokenizer.pad_token is None:
        if tokenizer.eos_token:
            tokenizer.pad_token = tokenizer.eos_token
        else:
            tokenizer.add_special_tokens({"pad_token": "<|pad|>"})

    tokenizer.padding_side = "right"
    return tokenizer


def load_model(
    model_id: str,
    trust_remote_code: bool = True,
    torch_dtype: Optional[torch.dtype] = None,
    device_map: str = "auto",
) -> PreTrainedModel:
    """Load LFM3 base or instruct model."""
    print(f"Loading model from: {model_id}...")
    device, optimal_dtype = get_optimal_device_and_dtype()
    chosen_dtype = torch_dtype or optimal_dtype

    print(f"Hardware target: device={device}, dtype={chosen_dtype}")

    # Handling device map for MPS/CPU vs CUDA
    resolved_device_map = device_map
    if device == "mps" and device_map == "auto":
        # For MPS, device_map="auto" works in recent accelerate, or directly move to mps
        resolved_device_map = "auto"
    elif device == "cpu" and device_map == "auto":
        resolved_device_map = None

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        trust_remote_code=trust_remote_code,
        dtype=chosen_dtype,
        device_map=resolved_device_map,
    )

    if resolved_device_map is None and device in ["mps", "cpu"]:
        model = model.to(device)

    # Disable KV cache during training for gradient checkpointing compatibility
    model.config.use_cache = False
    return model


def setup_lora_model(
    model: PreTrainedModel,
    config: AppConfig
) -> PreTrainedModel:
    """Wrap model with PEFT LoRA adapter."""
    peft_cfg = config.peft
    target_modules = peft_cfg.target_modules

    lora_config = LoraConfig(
        r=peft_cfg.r,
        lora_alpha=peft_cfg.lora_alpha,
        target_modules=target_modules,
        lora_dropout=peft_cfg.lora_dropout,
        bias=peft_cfg.bias,
        task_type=peft_cfg.task_type,
    )

    print(f"Configuring LoRA: r={peft_cfg.r}, alpha={peft_cfg.lora_alpha}, targets={target_modules}")
    peft_model = get_peft_model(model, lora_config)
    peft_model.print_trainable_parameters()
    return peft_model
