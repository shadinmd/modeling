# 🤖 On-Device Personal AI Assistant

A full-fledged, 24/7 personal assistant on Apple Silicon with real-time agentic file perception and living memory.

---

## 📁 Project Structure

```text
modeling/
├── backend/                  # FastAPI 24/7 Server & Agent Core
│   ├── venv/                 # Dedicated backend virtualenv
│   ├── memory/               # Living user profile (profile.yaml)
│   ├── workspace/            # Notes & documents directory (workspace/notes/)
│   ├── server.py             # Streaming REST & SSE API (:8000)
│   ├── agent.py              # Agent loop with tool reflection
│   ├── tools.py              # Real-time disk file reading & memory update tools
│   ├── llm.py                # Pluggable backends (LM Studio / Ollama / PyTorch)
│   └── requirements.txt
│
├── frontend/                 # React + Vite + Tailwind CSS Dashboard
│   ├── src/                  # App.tsx (Chat, Living Memory, Workspace Notes viewer)
│   ├── vite.config.ts        # Proxies /api to :8000
│   └── package.json
│
└── training/                 # [Isolated] Fine-tuning suite, datasets & Colab notebook
    ├── venv/                 # Dedicated training virtualenv
    ├── configs/              # training_config.yaml
    ├── data/                 # Training datasets & splits
    ├── src/                  # train.py, dataset.py, model.py, merge.py
    ├── requirements.txt      # PyTorch / PEFT dependencies
    └── train_colab.ipynb
```

---

## 🚀 Running

### Backend
```bash
cd backend
./venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm run dev
```

- **Dashboard:** [http://localhost:3000](http://localhost:3000)
- **API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
