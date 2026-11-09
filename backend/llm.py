"""
Pluggable LLM Backends for the Personal Assistant.
Supports:
1. Local OpenAI-Compatible Server (LM Studio, Ollama, vLLM, etc.)
2. Local Hugging Face (LFM3, Llama, Qwen, etc. on Apple Silicon MPS)
"""

import json
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple
import requests


class BaseLLMClient(ABC):
    """Abstract interface so any model backend can power the assistant."""

    @abstractmethod
    def generate(self, messages: List[Dict[str, str]], stream: bool = True) -> str:
        pass


class OpenAICompatibleClient(BaseLLMClient):
    """Connects to any running local server: LM Studio, Ollama, llama.cpp, etc."""

    def __init__(self, base_url: str = "http://localhost:1234/v1", model_name: str = "default"):
        self.base_url = base_url.rstrip("/")
        self.model_name = model_name
        print(f"Connected to local LLM server at {self.base_url} (model: {model_name})")

    def generate(self, messages: List[Dict[str, str]], stream: bool = True) -> str:
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0.3,
            "stream": stream,
        }

        if not stream:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

        # Streaming
        resp = requests.post(url, json=payload, stream=True, timeout=60)
        resp.raise_for_status()
        collected = []

        for line in resp.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8")
            if decoded.startswith("data: "):
                data_str = decoded[6:].strip()
                if data_str == "[DONE]":
                    break
                chunk = json.loads(data_str)
                delta = chunk["choices"][0]["delta"].get("content", "")
                if delta:
                    print(delta, end="", flush=True)
                    collected.append(delta)

        return "".join(collected).strip()


class HuggingFaceLocalClient(BaseLLMClient):
    """Loads and runs any model directly on Mac MPS or CUDA using PyTorch."""

    def __init__(self, model_id: str = "LiquidAI/LFM3-1.7B"):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if torch.cuda.is_available():
            self.device = "cuda"
            self.dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        elif torch.backends.mps.is_available():
            self.device = "mps"
            self.dtype = torch.bfloat16
        else:
            self.device = "cpu"
            self.dtype = torch.bfloat16

        print(f"Loading local Hugging Face model: {model_id} on {self.device}...")

        self.tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        self.model = AutoModelForCausalLM.from_pretrained(
            model_id,
            trust_remote_code=True,
            dtype=self.dtype,
            device_map="auto" if self.device in ["cuda", "mps"] else None,
        )
        self.model.eval()

    def generate(self, messages: List[Dict[str, str]], stream: bool = True) -> str:
        import torch
        from transformers import TextStreamer

        if hasattr(self.tokenizer, "apply_chat_template") and self.tokenizer.chat_template:
            prompt = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        else:
            prompt = ""
            for m in messages:
                prompt += f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n"
            prompt += "<|im_start|>assistant\n"

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        streamer = TextStreamer(self.tokenizer, skip_prompt=True, skip_special_tokens=True) if stream else None

        with torch.no_grad():
            output_tokens = self.model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.3,
                top_p=0.9,
                do_sample=True,
                streamer=streamer,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        gen_tokens = output_tokens[0][inputs["input_ids"].shape[1] :]
        return self.tokenizer.decode(gen_tokens, skip_special_tokens=True).strip()
