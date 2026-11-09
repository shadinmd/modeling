"""
Configuration management for LFM3-1.7B training and inference.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Union
import yaml


@dataclass
class ModelConfig:
    model_id: str = "LiquidAI/LFM3-1.7B"
    trust_remote_code: bool = True
    torch_dtype: str = "bfloat16"
    device_map: str = "auto"


@dataclass
class PeftConfig:
    r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    bias: str = "none"
    task_type: str = "CAUSAL_LM"
    target_modules: Union[str, List[str]] = field(
        default_factory=lambda: [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ]
    )


@dataclass
class DataConfig:
    train_file: str = "data/train.jsonl"
    val_file: Optional[str] = "data/val.jsonl"
    max_seq_length: int = 2048
    format_type: str = "messages"


@dataclass
class TrainingArgumentsConfig:
    output_dir: str = "outputs/lfm3-1.7b-personal-adapter"
    num_train_epochs: int = 3
    per_device_train_batch_size: int = 2
    per_device_eval_batch_size: int = 2
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-4
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.05
    weight_decay: float = 0.01
    logging_steps: int = 5
    eval_strategy: str = "epoch"
    save_strategy: str = "epoch"
    save_total_limit: int = 2
    load_best_model_at_end: bool = True
    gradient_checkpointing: bool = False
    report_to: str = "none"
    seed: int = 42


@dataclass
class AppConfig:
    model: ModelConfig = field(default_factory=ModelConfig)
    peft: PeftConfig = field(default_factory=PeftConfig)
    data: DataConfig = field(default_factory=DataConfig)
    training: TrainingArgumentsConfig = field(default_factory=TrainingArgumentsConfig)

    @classmethod
    def from_yaml(cls, yaml_path: Union[str, Path]) -> "AppConfig":
        with open(yaml_path, "r", encoding="utf-8") as f:
            raw_cfg = yaml.safe_load(f) or {}

        model_cfg = ModelConfig(**raw_cfg.get("model", {}))
        peft_cfg = PeftConfig(**raw_cfg.get("peft", {}))
        data_cfg = DataConfig(**raw_cfg.get("data", {}))
        training_cfg = TrainingArgumentsConfig(**raw_cfg.get("training", {}))

        return cls(
            model=model_cfg,
            peft=peft_cfg,
            data=data_cfg,
            training=training_cfg,
        )
