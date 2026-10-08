"""Fail-fast GPU diagnostics, with no model or dataset downloads."""
import ctypes
import json
import os
import shutil
import subprocess


def check_gpu():
    import torch
    report = {"torch": torch.__version__, "torch_cuda": torch.version.cuda,
              "ld_library_path": os.environ.get("LD_LIBRARY_PATH"),
              "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES")}
    binary = shutil.which("nvidia-smi")
    if binary:
        result = subprocess.run([binary], capture_output=True, text=True, timeout=30)
        report["nvidia_smi"] = result.stdout + result.stderr
    else:
        report["nvidia_smi"] = "not found on PATH"
    try:
        ctypes.CDLL("libcuda.so.1")
        report["driver_library"] = "loaded"
    except OSError as error:
        report["driver_library"] = str(error)
    try:
        torch.cuda.init()
        report.update(cuda_available=torch.cuda.is_available(), gpu=torch.cuda.get_device_name(0),
                      capability=torch.cuda.get_device_capability(0), bf16=torch.cuda.is_bf16_supported())
        if not report["bf16"]:
            raise RuntimeError("GPU does not support BF16")
        value = torch.ones((16, 16), device="cuda", dtype=torch.bfloat16)
        product = value @ value
        torch.cuda.synchronize()
        if product[0, 0].item() != 16:
            raise RuntimeError("BF16 matrix multiplication failed")
        report["bf16_matmul"] = "PASS"
    except Exception as error:
        report["error"] = repr(error)
        print(json.dumps(report, indent=2), flush=True)
        raise RuntimeError("GPU diagnostics failed before dataset/model download") from error
    print(json.dumps(report, indent=2), flush=True)
    return report


if __name__ == "__main__":
    check_gpu()
