#!/usr/bin/env python3
"""
Inference and interactive chat testing utility for LFM3-1.7B with or without LoRA adapter.
"""

import argparse
import sys
from pathlib import Path
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, TextStreamer

from src.model import get_optimal_device_and_dtype


def parse_args():
    parser = argparse.ArgumentParser(description="Test and chat with LFM3-1.7B personal model.")
    parser.add_argument(
        "--model-id",
        type=str,
        default="LiquidAI/LFM3-1.7B",
        help="Base model ID on Hugging Face or local path",
    )
    parser.add_argument(
        "--adapter",
        type=str,
        default="outputs/lfm3-1.7b-personal-adapter",
        help="Path to fine-tuned LoRA adapter directory (optional)",
    )
    parser.add_argument(
        "--no-adapter",
        action="store_true",
        help="Run pure base model without adapter for comparison",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Single prompt to evaluate (if omitted, launches interactive chat session)",
    )
    parser.add_argument(
        "--system-prompt",
        type=str,
        default="You are a personal AI assistant tailored with custom knowledge and persona.",
        help="System instruction",
    )
    parser.add_argument("--max-new-tokens", type=int, default=512, help="Max new tokens to generate")
    parser.add_argument("--temperature", type=float, default=0.7, help="Sampling temperature")
    parser.add_argument("--top-p", type=float, default=0.9, help="Nucleus sampling top-p")
    return parser.parse_args()


def main():
    args = parse_args()
    device, torch_dtype = get_optimal_device_and_dtype()
    print(f"Loading environment: device={device}, dtype={torch_dtype}")

    # Determine adapter path
    adapter_path = Path(args.adapter) if (args.adapter and not args.no_adapter) else None
    tokenizer_source = str(adapter_path) if (adapter_path and adapter_path.exists()) else args.model_id

    print(f"Loading tokenizer from: {tokenizer_source}...")
    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_source,
        trust_remote_code=True,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"Loading base model from: {args.model_id}...")
    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        trust_remote_code=True,
        dtype=torch_dtype,
        device_map="auto" if device in ["cuda", "mps"] else None,
    )

    if device == "cpu":
        model = model.to("cpu")

    if adapter_path and adapter_path.exists():
        print(f"Applying fine-tuned LoRA adapter from: {adapter_path}...")
        model = PeftModel.from_pretrained(model, str(adapter_path))
    else:
        if not args.no_adapter:
            print(f"Note: Adapter not found at '{adapter_path}'. Running base model.")

    model.eval()
    streamer = TextStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

    def generate_reply(messages):
        if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
            prompt = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        else:
            prompt = ""
            for m in messages:
                prompt += f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n"
            prompt += "<|im_start|>assistant\n"

        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

        with torch.no_grad():
            output_tokens = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                temperature=args.temperature,
                top_p=args.top_p,
                do_sample=args.temperature > 0,
                streamer=streamer,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        generated = output_tokens[0][inputs["input_ids"].shape[1] :]
        return tokenizer.decode(generated, skip_special_tokens=True)

    # 1. Single prompt evaluation
    if args.prompt:
        messages = [
            {"role": "system", "content": args.system_prompt},
            {"role": "user", "content": args.prompt},
        ]
        print(f"\nUser: {args.prompt}")
        print("Assistant: ", end="", flush=True)
        generate_reply(messages)
        print()
        return

    # 2. Interactive CLI chat
    print("\n" + "=" * 60)
    print(" LFM3-1.7B Personal Assistant Interactive Chat")
    print(" Type your message and hit Enter. Type 'exit' or 'quit' to stop.")
    print("=" * 60 + "\n")

    conversation = [{"role": "system", "content": args.system_prompt}]

    while True:
        try:
            user_input = input("You > ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit", "q"]:
                print("Exiting chat. Bye!")
                break

            conversation.append({"role": "user", "content": user_input})
            print("\nAssistant > ", end="", flush=True)
            response = generate_reply(conversation)
            conversation.append({"role": "assistant", "content": response})
            print()

        except (KeyboardInterrupt, EOFError):
            print("\nExiting chat. Bye!")
            break


if __name__ == "__main__":
    main()
