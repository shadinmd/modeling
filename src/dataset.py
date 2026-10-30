"""
Dataset loading, formatting, and preprocessing utilities.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
from datasets import Dataset, DatasetDict
from transformers import PreTrainedTokenizer

from src.config import DataConfig


def format_messages_with_template(
    messages: List[Dict[str, str]],
    tokenizer: PreTrainedTokenizer
) -> str:
    """Format conversation messages using tokenizer's chat template or ChatML fallback."""
    if hasattr(tokenizer, "apply_chat_template") and tokenizer.chat_template:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )

    # Standard ChatML fallback if tokenizer chat_template is not configured
    formatted = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "").strip()
        formatted += f"<|im_start|>{role}\n{content}<|im_end|>\n"
    return formatted


def load_raw_jsonl(file_path: Union[str, Path]) -> List[Dict]:
    """Read a JSONL file into list of dictionaries."""
    records = []
    with open(file_path, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except Exception as e:
                print(f"Warning: Failed to parse {file_path}:{idx}: {e}")
    return records


def prepare_hf_dataset(
    data_cfg: DataConfig,
    tokenizer: PreTrainedTokenizer
) -> Tuple[Dataset, Optional[Dataset]]:
    """Load train and validation splits, format into text field for SFTTrainer."""
    train_path = Path(data_cfg.train_file)
    if not train_path.exists():
        raise FileNotFoundError(f"Training dataset not found: {train_path}. Run data/prepare_data.py first.")

    train_raw = load_raw_jsonl(train_path)
    print(f"Loaded {len(train_raw)} training records from {train_path}")

    def format_records(records: List[Dict]) -> List[Dict[str, str]]:
        formatted = []
        for r in records:
            if "messages" in r:
                text = format_messages_with_template(r["messages"], tokenizer)
            elif "text" in r:
                text = r["text"]
            else:
                # Alpaca / prompt fallback
                prompt = r.get("prompt") or r.get("instruction", "")
                completion = r.get("completion") or r.get("output", "")
                text = f"<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n{completion}<|im_end|>\n"
            formatted.append({"text": text})
        return formatted

    train_formatted = format_records(train_raw)
    train_dataset = Dataset.from_list(train_formatted)

    val_dataset = None
    if data_cfg.val_file:
        val_path = Path(data_cfg.val_file)
        if val_path.exists():
            val_raw = load_raw_jsonl(val_path)
            print(f"Loaded {len(val_raw)} validation records from {val_path}")
            val_formatted = format_records(val_raw)
            val_dataset = Dataset.from_list(val_formatted)

    # Compute sequence length statistics on train
    lengths = [len(tokenizer.encode(item["text"])) for item in train_formatted]
    if lengths:
        avg_len = sum(lengths) / len(lengths)
        max_len = max(lengths)
        print(f"Dataset token stats - Count: {len(lengths)}, Avg tokens: {avg_len:.1f}, Max tokens: {max_len}")
        if max_len > data_cfg.max_seq_length:
            print(
                f"Warning: {sum(1 for l in lengths if l > data_cfg.max_seq_length)} samples "
                f"exceed max_seq_length={data_cfg.max_seq_length} and will be truncated."
            )

    return train_dataset, val_dataset
