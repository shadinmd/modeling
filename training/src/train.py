#!/usr/bin/env python3
"""
Main training script for fine-tuning Liquid AI's LFM3-1.7B on personal data using LoRA and TRL.
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

# Silence harmless pyenv/openssl warnings if present
logging.getLogger("root").setLevel(logging.ERROR)

import torch
from trl import SFTConfig, SFTTrainer

from src.config import AppConfig
from src.dataset import prepare_hf_dataset
from src.model import get_optimal_device_and_dtype, load_model, load_tokenizer, setup_lora_model


def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune LFM3-1.7B on personal data.")
    parser.add_argument(
        "--config", "-c",
        type=str,
        default="configs/training_config.yaml",
        help="Path to YAML training configuration file",
    )
    parser.add_argument("--model-id", type=str, default=None, help="Override base model ID")
    parser.add_argument("--train-file", type=str, default=None, help="Override train data path")
    parser.add_argument("--val-file", type=str, default=None, help="Override validation data path")
    parser.add_argument("--output-dir", type=str, default=None, help="Override output directory")
    parser.add_argument("--epochs", type=int, default=None, help="Override number of training epochs")
    parser.add_argument("--batch-size", type=int, default=None, help="Override per-device train batch size")
    parser.add_argument("--lr", type=float, default=None, help="Override learning rate")
    parser.add_argument(
        "--gradient-checkpointing",
        action="store_true",
        default=None,
        help="Enable gradient checkpointing to save ~50%% VRAM (at ~20%% speed cost)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    config_path = Path(args.config)
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    print(f"Loading configuration from {config_path}...")
    cfg = AppConfig.from_yaml(config_path)

    # Apply CLI overrides if provided
    if args.model_id:
        cfg.model.model_id = args.model_id
    if args.train_file:
        cfg.data.train_file = args.train_file
    if args.val_file:
        cfg.data.val_file = args.val_file
    if args.output_dir:
        cfg.training.output_dir = args.output_dir
    if args.epochs:
        cfg.training.num_train_epochs = args.epochs
    if args.batch_size:
        cfg.training.per_device_train_batch_size = args.batch_size
    if args.lr:
        cfg.training.learning_rate = args.lr
    if args.gradient_checkpointing is not None:
        cfg.training.gradient_checkpointing = args.gradient_checkpointing

    output_dir = Path(cfg.training.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. Hardware and device detection
    device, torch_dtype = get_optimal_device_and_dtype(cfg.model.torch_dtype)
    print(f"Training platform: device={device}, dtype={torch_dtype}")

    # 2. Tokenizer
    tokenizer = load_tokenizer(
        model_id=cfg.model.model_id,
        trust_remote_code=cfg.model.trust_remote_code,
    )

    # 3. Base Model
    base_model = load_model(
        model_id=cfg.model.model_id,
        trust_remote_code=cfg.model.trust_remote_code,
        torch_dtype=torch_dtype,
        device_map=cfg.model.device_map,
    )

    # 4. LoRA Adapter Setup
    model = setup_lora_model(base_model, cfg)

    if cfg.training.gradient_checkpointing:
        print("Enabling gradient checkpointing (saving memory, ~20% slower)...")
        if hasattr(model, "enable_input_require_grads"):
            model.enable_input_require_grads()

    # 5. Datasets
    train_dataset, val_dataset = prepare_hf_dataset(cfg.data, tokenizer)

    # 6. SFT Training Arguments
    # Configure precision flags based on target hardware
    use_fp16 = device == "cuda" and torch_dtype == torch.float16
    use_bf16 = device == "cuda" and torch_dtype == torch.bfloat16

    steps_per_epoch = max(1, len(train_dataset) // (cfg.training.per_device_train_batch_size * cfg.training.gradient_accumulation_steps))
    total_steps = steps_per_epoch * cfg.training.num_train_epochs
    warmup_steps = max(1, int(total_steps * cfg.training.warmup_ratio))
    print(f"Total training steps: ~{total_steps} (warmup steps: {warmup_steps})")

    sft_config = SFTConfig(
        output_dir=str(output_dir),
        dataset_text_field="text",
        max_length=cfg.data.max_seq_length,
        num_train_epochs=cfg.training.num_train_epochs,
        per_device_train_batch_size=cfg.training.per_device_train_batch_size,
        per_device_eval_batch_size=cfg.training.per_device_eval_batch_size,
        gradient_accumulation_steps=cfg.training.gradient_accumulation_steps,
        learning_rate=cfg.training.learning_rate,
        lr_scheduler_type=cfg.training.lr_scheduler_type,
        warmup_steps=warmup_steps,
        weight_decay=cfg.training.weight_decay,
        logging_steps=cfg.training.logging_steps,
        eval_strategy=cfg.training.eval_strategy if val_dataset is not None else "no",
        save_strategy=cfg.training.save_strategy,
        save_total_limit=cfg.training.save_total_limit,
        load_best_model_at_end=cfg.training.load_best_model_at_end if val_dataset is not None else False,
        report_to=cfg.training.report_to,
        seed=cfg.training.seed,
        gradient_checkpointing=cfg.training.gradient_checkpointing,
        fp16=use_fp16,
        bf16=use_bf16,
        dataloader_pin_memory=False if device == "mps" else True,
        logging_first_step=True,
    )

    # 7. SFT Trainer
    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
    )

    print("\nStarting LoRA Fine-Tuning on personal data...")
    start_time = time.time()
    train_result = trainer.train()
    elapsed = time.time() - start_time
    print(f"Training completed in {elapsed:.2f}s!")

    # 8. Save fine-tuned adapter and tokenizer
    print(f"Saving fine-tuned adapter and tokenizer to {output_dir}...")
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    # Save training metrics summary
    metrics = train_result.metrics
    metrics["training_time_seconds"] = round(elapsed, 2)
    metrics_path = output_dir / "training_summary.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"Saved training metrics to {metrics_path}")
    print(f"\nFine-tuning successful! You can now test your model using:")
    print(f"  python -m src.infer --adapter {output_dir}")


if __name__ == "__main__":
    main()
