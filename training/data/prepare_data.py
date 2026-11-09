#!/usr/bin/env python3
"""
Data preparation and validation script for personal data fine-tuning on LFM3-1.7B.

Supports:
- ChatML / OpenAI / Liquid format: {"messages": [{"role": "...", "content": "..."}]}
- Alpaca format: {"instruction": "...", "input": "...", "output": "..."}
- Prompt / Completion format: {"prompt": "...", "completion": "..."}
- Markdown / Raw text files: splits by headers/sections into QA pairs or documents.

Outputs clean train.jsonl and val.jsonl formatted for SFTTrainer.
"""

import argparse
import json
import os
import random
from pathlib import Path
from typing import Any, Dict, List, Tuple


def convert_record_to_messages(record: Dict[str, Any], default_system: str = "") -> List[Dict[str, str]]:
    """Convert various data formats into a standardized list of message dictionaries."""
    # 1. Already in messages format
    if "messages" in record and isinstance(record["messages"], list):
        messages = record["messages"]
        # Ensure system message exists if default provided
        if default_system and not any(m.get("role") == "system" for m in messages):
            messages = [{"role": "system", "content": default_system}] + messages
        return messages

    # 2. Alpaca format: instruction, (optional) input, output
    if "instruction" in record and "output" in record:
        user_content = record["instruction"].strip()
        if record.get("input") and record["input"].strip():
            user_content += f"\n\nContext:\n{record['input'].strip()}"
        
        messages = []
        if default_system or record.get("system"):
            messages.append({"role": "system", "content": record.get("system", default_system).strip()})
        messages.append({"role": "user", "content": user_content})
        messages.append({"role": "assistant", "content": record["output"].strip()})
        return messages

    # 3. Prompt / Completion format
    if "prompt" in record and "completion" in record:
        messages = []
        if default_system:
            messages.append({"role": "system", "content": default_system})
        messages.append({"role": "user", "content": record["prompt"].strip()})
        messages.append({"role": "assistant", "content": record["completion"].strip()})
        return messages

    # 4. Question / Answer format
    if "question" in record and "answer" in record:
        messages = []
        if default_system:
            messages.append({"role": "system", "content": default_system})
        messages.append({"role": "user", "content": record["question"].strip()})
        messages.append({"role": "assistant", "content": record["answer"].strip()})
        return messages

    raise ValueError(f"Unrecognized record format. Keys found: {list(record.keys())}")


def parse_markdown_notes(file_path: Path, default_system: str) -> List[Dict[str, Any]]:
    """
    Parse a Markdown file with personal notes/facts into conversational Q&A chunks.
    Assumes sections start with '# ' or '## ' as topics/questions.
    """
    content = file_path.read_text(encoding="utf-8")
    lines = content.splitlines()
    
    sections = []
    current_title = ""
    current_body = []
    
    for line in lines:
        if line.startswith("#"):
            if current_title and current_body:
                sections.append((current_title, "\n".join(current_body).strip()))
            current_title = line.lstrip("#").strip()
            current_body = []
        else:
            current_body.append(line)
            
    if current_title and current_body:
        sections.append((current_title, "\n".join(current_body).strip()))

    records = []
    for title, body in sections:
        if not body:
            continue
        records.append({
            "messages": [
                {"role": "system", "content": default_system},
                {"role": "user", "content": f"Tell me about: {title}"},
                {"role": "assistant", "content": body}
            ]
        })
    return records


def process_dataset(
    input_path: Path,
    default_system: str,
    val_ratio: float,
    seed: int
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Load, convert, validate, and split personal dataset."""
    raw_records = []
    
    if input_path.suffix in [".jsonl", ".json"]:
        with open(input_path, "r", encoding="utf-8") as f:
            for idx, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    messages = convert_record_to_messages(data, default_system=default_system)
                    # Validate messages
                    if len(messages) >= 2 and any(m.get("role") == "assistant" for m in messages):
                        raw_records.append({"messages": messages})
                    else:
                        print(f"Warning: Skipping line {idx} (needs at least user and assistant turns)")
                except Exception as e:
                    print(f"Warning: Failed to parse line {idx}: {e}")
    elif input_path.suffix in [".md", ".markdown", ".txt"]:
        raw_records = parse_markdown_notes(input_path, default_system)
    else:
        raise ValueError(f"Unsupported file format: {input_path.suffix}. Use .jsonl, .json, or .md")

    if not raw_records:
        raise ValueError(f"No valid records found in {input_path}")

    # Shuffle deterministically
    random.seed(seed)
    random.shuffle(raw_records)

    val_count = max(1, int(len(raw_records) * val_ratio)) if len(raw_records) > 4 else 0
    val_records = raw_records[:val_count]
    train_records = raw_records[val_count:]

    if not train_records:
        # Fallback if dataset is very small
        train_records = val_records

    return train_records, val_records


def main():
    parser = argparse.ArgumentParser(description="Prepare personal data for LFM3-1.7B fine-tuning.")
    parser.add_argument("--input", "-i", type=str, default="data/sample_personal_data.jsonl",
                        help="Path to raw personal data (.jsonl, .json, or .md)")
    parser.add_argument("--output-dir", "-o", type=str, default="data",
                        help="Directory to save train.jsonl and val.jsonl")
    parser.add_argument("--val-ratio", type=float, default=0.15,
                        help="Fraction of data reserved for validation (default: 0.15)")
    parser.add_argument("--system-prompt", type=str,
                        default="You are a personal AI assistant tailored with custom knowledge and persona.",
                        help="Default system prompt for conversations")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for splitting")

    args = parser.parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    print(f"Loading and processing {input_path}...")
    train_data, val_data = process_dataset(
        input_path=input_path,
        default_system=args.system_prompt,
        val_ratio=args.val_ratio,
        seed=args.seed
    )

    train_out = output_dir / "train.jsonl"
    val_out = output_dir / "val.jsonl"

    with open(train_out, "w", encoding="utf-8") as f:
        for r in train_data:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    with open(val_out, "w", encoding="utf-8") as f:
        for r in val_data:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"Data preparation complete:")
    print(f"  • Training samples:   {len(train_data)} saved to {train_out}")
    print(f"  • Validation samples: {len(val_data)} saved to {val_out}")
    print(f"  • Sample turn count:  {len(train_data[0]['messages'])} messages in first training example")


if __name__ == "__main__":
    main()
