#!/usr/bin/env python3
"""
Merge LoRA adapter weights with base model and export a standalone model.
Useful for deployment, exporting to GGUF (llama.cpp/Ollama), or ONNX.
"""

import argparse
from pathlib import Path
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def parse_args():
    parser = argparse.ArgumentParser(description="Merge LoRA adapter into LFM3 base model.")
    parser.add_argument(
        "--base-model",
        type=str,
        default="LiquidAI/LFM3-1.7B",
        help="Base model ID or path",
    )
    parser.add_argument(
        "--adapter",
        type=str,
        default="outputs/lfm3-1.7b-personal-adapter",
        help="Directory containing the fine-tuned LoRA adapter",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="outputs/lfm3-1.7b-personal-merged",
        help="Destination directory to save merged model",
    )
    parser.add_argument(
        "--dtype",
        type=str,
        default="float16",
        choices=["float16", "bfloat16", "float32"],
        help="Weight precision for merged model export",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    adapter_path = Path(args.adapter)
    output_path = Path(args.output_dir)

    if not adapter_path.exists():
        raise FileNotFoundError(f"Adapter directory not found: {adapter_path}")

    dtype_map = {
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
        "float32": torch.float32,
    }
    torch_dtype = dtype_map[args.dtype]

    print(f"Loading tokenizer from: {args.base_model}...")
    tokenizer = AutoTokenizer.from_pretrained(
        args.base_model,
        trust_remote_code=True,
    )

    print(f"Loading base model ({args.base_model}) in {args.dtype}...")
    base_model = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        trust_remote_code=True,
        dtype=torch_dtype,
        device_map="cpu",  # Merge on CPU to avoid device memory overhead
    )

    print(f"Loading LoRA adapter from: {adapter_path}...")
    peft_model = PeftModel.from_pretrained(base_model, str(adapter_path))

    print("Merging adapter weights into base model layers...")
    merged_model = peft_model.merge_and_unload()

    output_path.mkdir(parents=True, exist_ok=True)
    print(f"Saving merged model to: {output_path}...")
    merged_model.save_pretrained(str(output_path), safe_serialization=True)
    tokenizer.save_pretrained(str(output_path))

    print(f"\nModel merged successfully!")
    print(f"Standalone checkpoint ready at: {output_path}")


if __name__ == "__main__":
    main()
