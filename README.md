# LFM3-1.7B Personal Data Training & Fine-Tuning

A complete, modular fine-tuning suite for **Liquid AI's LFM3-1.7B** model, specifically structured for adapting the model with **personal data** (custom knowledge, personal assistants, notes, conversation logs, and domain workflows).

---

## 🌟 Highlights

- **Model Backbone:** Tailored for [`LiquidAI/LFM3-1.7B`](https://huggingface.co/LiquidAI/LFM3-1.7B) (tri-hybrid architecture combining short convolutions, sliding-window attention, and global attention).
- **Efficient Adaptation:** Parameter-Efficient Fine-Tuning (**LoRA**) targeting attention and projection layers with minimal memory usage.
- **Hardware Optimized:** Automatic hardware detection supporting **Apple Silicon (MPS)**, **NVIDIA CUDA**, and CPU fallback with `bfloat16`/`float16`.
- **Flexible Data Ingestion:** Supports ChatML conversations (`{"messages": [...]}`), Alpaca format (`{"instruction": ...}`), and raw Markdown notes.
- **End-to-End Workflow:** Data preparation $\rightarrow$ LoRA Supervised Fine-Tuning (TRL `SFTTrainer`) $\rightarrow$ Interactive CLI Chat with streaming $\rightarrow$ Standalone model weight merging.

---

## 📁 Repository Structure

```text
modeling/
├── configs/
│   └── training_config.yaml       # Hyperparameters (LoRA, learning rate, epochs, device)
├── data/
│   ├── sample_personal_data.jsonl # Example personal data dataset
│   ├── prepare_data.py            # Ingestion, validation & train/val split script
│   ├── train.jsonl                # Processed training dataset
│   └── val.jsonl                  # Processed validation dataset
├── src/
│   ├── __init__.py
│   ├── config.py                  # YAML config loader and dataclasses
│   ├── dataset.py                 # Dataset tokenization and formatting utilities
│   ├── infer.py                   # Real-time streaming CLI chat & prompt tester
│   ├── merge.py                   # LoRA adapter merger to produce standalone models
│   ├── model.py                   # Model & tokenizer loader (with remote code support)
│   └── train.py                   # SFTTrainer training loop
├── .gitignore
├── requirements.txt
└── README.md
```

---

## 🚀 Quickstart

### 1. Environment Setup

Ensure Python 3.12 is active, then install dependencies:

```bash
# Create and activate virtual environment (if not already active)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

---

## 📝 Formatting & Preparing Personal Data

### 1. Supported Formats

You can format your personal data in one of three ways:

#### A. Multi-turn / Single-turn Conversations (Recommended)
Add records in `data/` as JSONL:
```json
{
  "messages": [
    {"role": "system", "content": "You are a personal AI assistant tailored with custom knowledge and persona."},
    {"role": "user", "content": "What are my main projects this month?"},
    {"role": "assistant", "content": "Your main projects this month are training LFM3-1.7B on personal notes and building an edge agent."}
  ]
}
```

#### B. Alpaca / Instruction Format
```json
{
  "instruction": "What is my preferred tech stack?",
  "input": "",
  "output": "You prefer Python 3.12, PyTorch, Hugging Face, and Apple Silicon / CUDA optimization."
}
```

#### C. Raw Markdown Notes (`.md`)
Create a markdown file (e.g. `data/my_notes.md`) with headers representing topics/questions:
```markdown
# Personal Engineering Workflow
I structure my repositories with modular src/, config files, and comprehensive tests.

# Daily Routine
Deep work blocks in the morning, experimentation and testing in the afternoon.
```

### 2. Run Data Preparation

Run the preparation script to validate, format, and split into `train.jsonl` and `val.jsonl`:

```bash
# Using sample data
python data/prepare_data.py --input data/sample_personal_data.jsonl --val-ratio 0.15

# Or using your own personal data file
python data/prepare_data.py --input data/my_personal_data.jsonl --val-ratio 0.15
```

---

## ⚙️ Configuration

Hyperparameters can be modified in [`configs/training_config.yaml`](file:///Users/shadin/code/modeling/configs/training_config.yaml):

```yaml
model:
  model_id: "LiquidAI/LFM3-1.7B" # Or "LiquidAI/LFM3-1.7B-Base"
  trust_remote_code: true
  torch_dtype: "bfloat16"

peft:
  r: 16
  lora_alpha: 32
  lora_dropout: 0.05
  target_modules:
    - "q_proj"
    - "k_proj"
    - "v_proj"
    - "o_proj"
    - "gate_proj"
    - "up_proj"
    - "down_proj"

training:
  output_dir: "outputs/lfm3-1.7b-personal-adapter"
  num_train_epochs: 3
  per_device_train_batch_size: 2
  gradient_accumulation_steps: 4
  learning_rate: 0.0002
  gradient_checkpointing: false # Set true to cut memory usage by ~50%
```

---

## 🏋️‍♂️ Training (Fine-Tuning)

To start fine-tuning with the default configuration:

```bash
python -m src.train
```

### CLI Overrides
You can override settings directly from the command line:

```bash
python -m src.train \
  --epochs 5 \
  --batch-size 2 \
  --lr 0.0003 \
  --gradient-checkpointing \
  --output-dir outputs/my-experiment
```

The fine-tuned LoRA adapter and tokenizer will be saved to `outputs/lfm3-1.7b-personal-adapter/`.

---

## 💬 Testing & Inference

### 1. Interactive Streaming Chat
Chat interactively with your fine-tuned model:

```bash
python -m src.infer --adapter outputs/lfm3-1.7b-personal-adapter
```

### 2. Single Prompt Evaluation
Test a specific prompt:

```bash
python -m src.infer \
  --adapter outputs/lfm3-1.7b-personal-adapter \
  --prompt "Who am I and what are my current engineering projects?"
```

### 3. Compare with Base Model
Run without the adapter to observe the difference:

```bash
python -m src.infer --no-adapter --prompt "Who am I and what are my current engineering projects?"
```

---

## 🔄 Merging & Exporting

To merge the fine-tuned LoRA adapter back into the base LFM3 model to produce a standalone model (suitable for export to GGUF, Ollama, or vLLM):

```bash
python -m src.merge \
  --adapter outputs/lfm3-1.7b-personal-adapter \
  --output-dir outputs/lfm3-1.7b-personal-merged
```
