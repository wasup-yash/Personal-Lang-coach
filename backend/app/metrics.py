from prometheus_client import Counter, Histogram, Gauge

REQUESTS = Counter("pronunciation_asr_requests_total", "ASR requests", ["language", "status"])
STAGE_SECONDS = Histogram("pronunciation_pipeline_stage_seconds", "Pipeline-stage latency", ["stage"])
GPU_SECONDS = Counter("pronunciation_gpu_seconds_total", "Estimated model execution seconds")
GPU_COST = Counter("pronunciation_gpu_cost_usd_total", "Estimated GPU inference cost in USD")
QUEUE_DEPTH = Gauge("pronunciation_queue_depth", "Queue depth; zero for synchronous deployment")
ALIGNMENT_FALLBACKS = Counter("pronunciation_alignment_fallbacks_total", "Alignment fallbacks", ["language", "reason"])
