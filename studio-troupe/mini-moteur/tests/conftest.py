import sys
from pathlib import Path

import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _threads_et_graine():
    torch.set_num_threads(4)
    torch.manual_seed(0)
    yield
