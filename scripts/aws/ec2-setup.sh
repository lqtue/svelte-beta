#!/usr/bin/env bash
# ec2-setup.sh — Bootstrap a g4dn.xlarge spot instance for SAM2 vectorization.
#
# Usage
# -----
#   # 1. Launch spot instance (fill in your key-pair name, SG id, subnet id):
#   aws ec2 run-instances \
#     --instance-type g4dn.xlarge \
#     --image-id resolve:ssm:/aws/service/deeplearning/ami/x86_64/base-gpu-py312-cu121-ubuntu22.04-dlami/latest \
#     --instance-market-options '{"MarketType":"spot","SpotOptions":{"SpotInstanceType":"one-time"}}' \
#     --key-name YOUR_KEY_PAIR \
#     --security-group-ids sg-XXXXXXXX \
#     --subnet-id subnet-XXXXXXXX \
#     --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
#     --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=vma-sam2}]' \
#     --query 'Instances[0].InstanceId' --output text
#
#   # 2. SSH in and run this script:
#   chmod +x ec2-setup.sh && ./ec2-setup.sh
#
# The Deep Learning AMI has CUDA 12.1 + conda pre-installed.
# Estimated spot price: ~$0.16/hr (us-east-1, March 2026).
# Stop the instance between jobs to avoid idle charges.

set -euo pipefail

echo "=== VMA SAM2 EC2 Setup ==="

# ── 1. Verify GPU ──────────────────────────────────────────────────────────────
echo "--- GPU check ---"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# ── 2. Create conda environment ────────────────────────────────────────────────
echo "--- Creating conda environment 'vma' (Python 3.11) ---"
conda create -y -n vma python=3.11

# Activate for this script (conda init not needed since we use full path)
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate vma

# ── 3. PyTorch with CUDA 12.1 ──────────────────────────────────────────────────
echo "--- Installing PyTorch (CUDA 12.1) ---"
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# ── 4. SAM2 ───────────────────────────────────────────────────────────────────
echo "--- Installing SAM2 ---"
pip install git+https://github.com/facebookresearch/segment-anything-2.git

# ── 5. Pipeline dependencies ───────────────────────────────────────────────────
echo "--- Installing pipeline dependencies ---"
pip install \
  requests \
  opencv-python-headless \
  shapely \
  scikit-image \
  numpy \
  pillow \
  internetarchive

# ── 6. SAM2.1 Large checkpoint (~900 MB) ──────────────────────────────────────
echo "--- Downloading SAM2.1 Large checkpoint ---"
mkdir -p ~/checkpoints
wget -q --show-progress -O ~/checkpoints/sam2.1_hiera_large.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
echo "Checkpoint saved to ~/checkpoints/sam2.1_hiera_large.pt"

# ── 7. Clone VMA repo ──────────────────────────────────────────────────────────
echo "--- Cloning VMA repo ---"
if [ -d ~/svelte-beta ]; then
  echo "  Repo already cloned — pulling latest"
  git -C ~/svelte-beta pull
else
  git clone https://github.com/YOUR_ORG/svelte-beta.git ~/svelte-beta
fi

# ── 8. Environment variables ───────────────────────────────────────────────────
ENV_FILE=~/svelte-beta/.env.vectorize
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
export SUPABASE_URL=https://YOUR_PROJECT.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...
EOF
  echo "--- Created $ENV_FILE — fill in your credentials before running vectorize.py ---"
else
  echo "--- $ENV_FILE already exists ---"
fi

# ── 9. Smoke test ──────────────────────────────────────────────────────────────
echo "--- Smoke test: SAM2 import ---"
python - <<'PYEOF'
import torch
from sam2.build_sam import build_sam2
from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
print(f"  torch {torch.__version__}, CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"  GPU: {torch.cuda.get_device_name(0)}")
    print(f"  VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
print("  SAM2 imports OK")
PYEOF

echo ""
echo "=== Setup complete ==="
echo ""
echo "To run vectorization:"
echo "  conda activate vma"
echo "  source ~/svelte-beta/.env.vectorize"
echo "  cd ~/svelte-beta"
echo "  python scripts/vectorize.py vectorize \\"
echo "    --ia-url 'https://archive.org/details/vma-map-XXXX' \\"
echo "    --valid-from 1882 \\"
echo "    --color-profile saigon-1882 \\"
echo "    --grayscale-sam --bitonal-blank --regularize \\"
echo "    --sam-checkpoint ~/checkpoints/sam2.1_hiera_large.pt"
echo ""
echo "Stop the instance when idle:"
echo "  sudo shutdown -h now"
