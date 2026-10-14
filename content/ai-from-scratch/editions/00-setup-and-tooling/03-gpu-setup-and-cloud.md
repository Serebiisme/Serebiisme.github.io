# GPU 配置与云端实验

> 学习时可以用 CPU；较重的训练任务通常需要 GPU 加速。

**类型：** 动手实践
**语言：** Python
**前置要求：** 阶段 0，第 01 课
**预计时间：** 约 45 分钟

## 学习目标

- 用 `nvidia-smi` 和 PyTorch 的 CUDA API 检查本地 GPU。
- 在 Google Colab 中选择 GPU 运行时，尝试云端实验。
- 比较 CPU 与 GPU 的矩阵乘法耗时，测量当前环境的加速比。
- 用 fp16 每个参数约 2 字节的经验估算，理解权重占用的显存规模。

## 要解决的问题

阶段 1–3 的多数课程可以在 CPU 上完成。进入 CNN、Transformer 和 LLM 训练后，GPU 加速会更重要。原文用「CPU 训练 8 小时、GPU 训练 10 分钟」说明潜在差距；这是示意，不是对你的设备或训练任务的时间保证。

原课程列出三条路线：已有的本地 GPU、Google Colab，以及按需租用的云 GPU。

## 三条路线

下面保留原文的对比框，里面的费用数字只代表原课程的示例，不是当前报价：

```
Your options:

1. Local NVIDIA GPU
   Cost: $0 (you already have it)
   Setup: Install CUDA + cuDNN
   Best for: Regular use, large datasets

2. Google Colab (free tier)
   Cost: $0
   Setup: None
   Best for: Quick experiments, no GPU at home

3. Cloud GPU (Lambda, RunPod, Vast.ai)
   Cost: $0.20-2.00/hr
   Setup: SSH + install
   Best for: Serious training, large models
```

中文理解：已有本地 GPU 适合反复实验，但还要考虑驱动、软件与运行成本；Colab 可以减少本地配置工作；云实例则需要远程连接、安装依赖并管理资源。

```figure
s0-gpu-dispatch
```

## 动手检查

### 路线 1：本地 NVIDIA GPU

先检查驱动是否能识别 GPU：

```bash
nvidia-smi
```

原文接着展示下面的 Python 代码。它用于检查已经安装的 PyTorch，而不是执行安装：

```python
import torch

print(f"CUDA available: {torch.cuda.is_available()}")
print(f"CUDA version: {torch.version.cuda}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
```

### 路线 2：Google Colab

1. 打开 [Google Colab](https://colab.research.google.com)。
2. 按原文在 Runtime → Change runtime type 中选择 T4 GPU；是否能获得该 GPU 取决于当时的资源和账户条件。
3. 运行 `!nvidia-smi`，检查实际分配到的设备。

可以将课程 Notebook 上传到 Colab。不要把「免费层」理解为 GPU 类型、资源量或持续运行时长有保证。

### 路线 3：云 GPU

原课程以 Lambda Labs、RunPod 和 Vast.ai 为例，展示登录实例、安装 PyTorch 和检查设备的流程：

```bash
ssh user@your-gpu-instance

pip install torch torchvision torchaudio
python -c "import torch; print(torch.cuda.get_device_name(0))"
```

### 没有 GPU 时

多数基础课程仍可先在 CPU 上完成。原文说明，需要 GPU 的课程会注明要求并提供 Colab 链接。

```python
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using: {device}")
```

这段示例只判断 CUDA，因此 Mac 上即使有 MPS，也会落到 CPU。MPS 是另一条后端路径，参见第 01 课的说明。

## 比较 GPU 与 CPU 的矩阵乘法

原课程用两个 5000 × 5000 的随机矩阵做测试：

```python
import torch
import time

size = 5000

a_cpu = torch.randn(size, size)
b_cpu = torch.randn(size, size)

start = time.time()
c_cpu = a_cpu @ b_cpu
cpu_time = time.time() - start
print(f"CPU: {cpu_time:.3f}s")

if torch.cuda.is_available():
    a_gpu = a_cpu.to("cuda")
    b_gpu = b_cpu.to("cuda")

    torch.cuda.synchronize()
    start = time.time()
    c_gpu = a_gpu @ b_gpu
    torch.cuda.synchronize()
    gpu_time = time.time() - start
    print(f"GPU: {gpu_time:.3f}s")
    print(f"Speedup: {cpu_time / gpu_time:.0f}x")
```

GPU 操作可能异步执行，计时前后用 `torch.cuda.synchronize()` 等待工作完成。示例将 CPU→GPU 的数据传输放在计时区间之外；打印的加速比只比较这段矩阵乘法，不代表包含传输、数据加载与训练其他步骤的完整耗时。

## 练习

1. 运行上面的测试，对比自己环境中 CPU 与 GPU 的耗时。
2. 如果没有本地 GPU，尝试在 Colab 上运行并比较结果；记录实际得到的设备。
3. 检查显存容量，用 fp16 每参数 2 字节估算仅权重的占用，再说明这个估算为什么不能直接当作训练容量。

## 关键术语

| 术语 | 常见说法 | 实际含义 |
|---|---|---|
| CUDA | “GPU 编程” | NVIDIA 的并行计算平台；这套示例用它调用 NVIDIA GPU |
| VRAM | “GPU 内存” | 独立 GPU 的显存，与系统内存区分；容量会限制模型及运行状态的规模 |
| fp16 | “半精度” | 16 位浮点表示，每个值 2 字节，是 fp32 的一半；精度影响需要按任务验证 |
| Tensor Core | “快速矩阵硬件” | 加速矩阵运算的专用硬件；原文以 4–8 倍描述收益，实际取决于硬件、数据类型与运算形状 |

## 本站校订与运行边界

- 全文对照英文校订，修复草稿中「变压器」「基数乘法」「fp16 指纹」等误译，并补回原文段落、练习与术语表。
- 原对比框中的本地 `$0` 只表示已经拥有设备，不表示没有电费或购置成本。云价格、免费资源与可用 GPU 会变动，须以服务商实际界面为准；本文不推荐按示例价格租用设备。
- fp16 的 `参数量 × 2 字节` 只估算权重；训练还可能占用梯度、优化器状态、激活与临时缓冲，推理还可能需要 KV cache。不能直接用 `显存 ÷ 2` 得出可训练模型的保证上限。
- 示例默认随机张量通常是 fp32，没有显式演示 fp16；也没有证明一定使用 Tensor Core。计时未包含数据传输，没有预热或重复统计，适合入门观察，不是严谨的硬件排名。
- NVIDIA 检查与本地矩阵乘法在依赖就绪后可离线运行；安装、Colab 和云实例需要联网。本站没有执行这些代码或创建付费资源。

校核资料：[Colab 常见问题](https://research.google.com/colaboratory/faq.html)、[NVIDIA nvidia-smi 文档](https://docs.nvidia.com/deploy/nvidia-smi/index.html)、[PyTorch CUDA 语义](https://docs.pytorch.org/docs/stable/notes/cuda.html)。
