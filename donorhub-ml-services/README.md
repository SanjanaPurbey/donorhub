# DonorHub ML Service

Machine Learning inference service for the DonorHub blood donation matching system.

## Overview

This service provides ML-powered donor ranking and matching capabilities:

- **Donor Ranking**: Ranks eligible donors for a blood request using ML scoring (60% ML + 40% rule-based)
- **Match Scoring**: Detailed match score for specific donor-request pairs
- **Availability Prediction**: Predicts donor availability likelihood

## Technology Stack

- **Python**: 3.10 (required)
- **Framework**: Flask (WSGI-compatible)
- **Server**: uWSGI (PythonAnywhere) / Built-in (local)
- **ML**: scikit-learn 1.7.0+
- **Model Format**: joblib

## Project Structure

```
donorhub-ml-services/
├── wsgi_app.py              # Flask WSGI app (self-contained, ~960 lines)
├── models/
│   └── donor_ranker.joblib  # Pre-trained ML model
├── requirements.txt         # Python dependencies
├── .env                     # Environment variables (create from .env.example)
├── .env.example             # Environment template
└── README.md
```

---

## API Endpoints

| Endpoint | Method | Auth | Description |
| -------- | ------ | ---- | ----------- |
| `/` | GET | None | Service info |
| `/api/v1/health` | GET | None | Health check |
| `/api/v1/match/rank` | POST | Required | Rank eligible donors |
| `/api/v1/match/score` | POST | Required | Single match score with breakdown |
| `/api/v1/predict/availability` | POST | Required | Predict donor availability |

## Authentication

Protected endpoints require the `X-ML-API-KEY` header:

```bash
curl -X POST http://localhost:8000/api/v1/match/rank \
  -H "Content-Type: application/json" \
  -H "X-ML-API-KEY: your-api-key" \
  -d '{"bloodRequest": {...}, "eligibleDonors": [...]}'
```

---

## Environment Variables

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `ML_API_KEY` | Yes (prod) | - | API key for authentication |
| `ALLOWED_ORIGINS_STR` | No | localhost:3000 | Comma-separated allowed origins |
| `ML_MODEL_PATH` | No | models/donor_ranker.joblib | Path to model file |
| `ML_MODEL_VERSION` | No | v1.2.0 | Model version string |
| `SERVICE_VERSION` | No | 1.0.0 | Service version |
| `DEBUG` | No | false | Enable debug mode (skips auth) |

---

## Local Development Setup

### Prerequisites

- **Python 3.10** (required - not 3.11 or 3.12 due to scikit-learn compatibility)
- **pip** (Python package manager)
- **Git** (for cloning)

### Step 1: Install Python 3.10

#### Windows

1. Download Python 3.10 from: https://www.python.org/downloads/release/python-31011/
2. Run the installer
3. **Important**: Check "Add Python 3.10 to PATH"
4. Click "Install Now"
5. Verify installation:
   ```powershell
   python --version
   # Should output: Python 3.10.x
   ```

If you have multiple Python versions, use `py -3.10` instead of `python`:
```powershell
py -3.10 --version
```

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt install python3.10 python3.10-venv python3.10-dev
python3.10 --version
```

#### macOS

```bash
brew install python@3.10
python3.10 --version
```

### Step 2: Clone and Navigate

```bash
cd /path/to/your/projects
git clone <repository-url>
cd donorhub-ml-services
```

Or if you already have the code:
```bash
cd donorhub-ml-services
```

### Step 3: Create Virtual Environment

#### Windows (PowerShell)

```powershell
# Using Python 3.10 specifically
py -3.10 -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Verify Python version in venv
python --version
# Should output: Python 3.10.x
```

If you get an execution policy error:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Windows (Command Prompt)

```cmd
py -3.10 -m venv venv
venv\Scripts\activate.bat
python --version
```

#### Linux/macOS

```bash
python3.10 -m venv venv
source venv/bin/activate
python --version
```

### Step 4: Install Dependencies

```bash
# Upgrade pip first
python -m pip install --upgrade pip

# Install all dependencies
pip install -r requirements.txt

# Verify installations
pip list
```

Expected packages:
- Flask >= 3.0.0
- scikit-learn >= 1.7.0
- joblib >= 1.3.2
- numpy >= 1.26.4

### Step 5: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

Or on Windows:
```powershell
Copy-Item .env.example .env
```

Edit `.env` with your settings:
```dotenv
ML_API_KEY=your-secure-api-key-minimum-32-characters
ALLOWED_ORIGINS_STR=http://localhost:3000,http://127.0.0.1:3000
ML_MODEL_PATH=models/donor_ranker.joblib
ML_MODEL_VERSION=v1.2.0
SERVICE_VERSION=1.0.0
DEBUG=true
```

### Step 6: Run the Service

```bash
python wsgi_app.py
```

The service will start at `http://localhost:8000`

### Step 7: Test the Service

```bash
# Health check
curl http://localhost:8000/api/v1/health

# Or in PowerShell
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health"
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "modelVersion": "v1.2.0",
  "uptime": 5,
  "lastModelUpdate": "2026-01-15T00:00:00Z"
}
```

---

## PythonAnywhere Deployment

Complete step-by-step guide to deploy on PythonAnywhere.

### Prerequisites

- PythonAnywhere account (free tier works)
- The trained model file (`donor_ranker.joblib`)

### Step 1: Create PythonAnywhere Account

1. Go to https://www.pythonanywhere.com
2. Sign up for a free account (or paid for custom domain)
3. Note your username (e.g., `donorhubml`)

### Step 2: Upload Files via Files Tab

1. Go to **Files** tab in PythonAnywhere dashboard
2. Navigate to `/home/YOUR_USERNAME/`
3. Create folder: `donorhub-ml-services`
4. Upload these files:
   - `wsgi_app.py`
   - `requirements.txt`
   - `.env` (optional, we'll set env vars in WSGI config)
5. Create subfolder: `models`
6. Upload: `models/donor_ranker.joblib`

**Alternative: Upload via Git**

Open a Bash console in PythonAnywhere:
```bash
cd ~
git clone <your-repository-url> donorhub-ml-services
```

### Step 3: Create Virtual Environment

Open a **Bash console** in PythonAnywhere and run:

```bash
# Create virtual environment with Python 3.10
mkvirtualenv --python=/usr/bin/python3.10 donorhub-ml-env

# Activate it (should activate automatically after creation)
workon donorhub-ml-env

# Verify Python version
python --version
# Should output: Python 3.10.x

# Navigate to project
cd ~/donorhub-ml-services

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Verify installations
pip list | grep -E "Flask|scikit-learn|joblib|numpy"
```

### Step 4: Create Web App

1. Go to **Web** tab in PythonAnywhere dashboard
2. Click **Add a new web app**
3. Select **Manual configuration** (NOT Flask)
4. Select **Python 3.10**
5. Click Next to create

### Step 5: Configure Virtual Environment Path

In the **Web** tab, find **Virtualenv** section:

1. Enter: `/home/YOUR_USERNAME/.virtualenvs/donorhub-ml-env`
2. Click the checkmark to save

### Step 6: Configure WSGI File

1. In **Web** tab, click on the **WSGI configuration file** link
   (e.g., `/var/www/YOUR_USERNAME_pythonanywhere_com_wsgi.py`)

2. **Delete all existing content** and replace with:

```python
import sys
import os

# =============================================================================
# Project Configuration
# =============================================================================

# Replace YOUR_USERNAME with your actual PythonAnywhere username
project_home = '/home/YOUR_USERNAME/donorhub-ml-services'

# Add project to Python path
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Set working directory
os.chdir(project_home)

# =============================================================================
# Environment Variables (REQUIRED)
# =============================================================================

# Security - API Key (REQUIRED for production)
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
os.environ['ML_API_KEY'] = 'YOUR_SECURE_API_KEY_MINIMUM_32_CHARACTERS'

# CORS - Allowed Origins (comma-separated)
# Add your Vercel domain and localhost for development
os.environ['ALLOWED_ORIGINS_STR'] = 'https://your-donorhub.vercel.app,http://localhost:3000'

# Model Configuration
os.environ['ML_MODEL_PATH'] = '/home/YOUR_USERNAME/donorhub-ml-services/models/donor_ranker.joblib'
os.environ['ML_MODEL_VERSION'] = 'v1.2.0'

# Service Configuration
os.environ['SERVICE_VERSION'] = '1.0.0'
os.environ['DEBUG'] = 'false'  # IMPORTANT: Set to 'false' in production

# =============================================================================
# Load Flask Application
# =============================================================================

from wsgi_app import application
```

3. **Replace all occurrences of `YOUR_USERNAME`** with your actual PythonAnywhere username
4. **Set a secure `ML_API_KEY`** - generate one with:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
5. **Update `ALLOWED_ORIGINS_STR`** with your actual frontend domain
6. Save the file

### Step 7: Reload Web App

1. Go back to **Web** tab
2. Click the green **Reload** button
3. Wait for reload to complete

### Step 8: Test Deployment

```bash
# Health check (no auth required)
curl https://YOUR_USERNAME.pythonanywhere.com/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "modelVersion": "v1.2.0",
  "uptime": 123,
  "lastModelUpdate": "2026-01-15T00:00:00Z"
}
```

Test authenticated endpoint:
```bash
curl -X POST https://YOUR_USERNAME.pythonanywhere.com/api/v1/match/rank \
  -H "Content-Type: application/json" \
  -H "X-ML-API-KEY: YOUR_SECURE_API_KEY" \
  -d '{
    "bloodRequest": {
      "id": "test_req_1",
      "bloodGroup": "A_POSITIVE",
      "urgency": "HIGH",
      "unitsRequired": 2,
      "hospital": "Test Hospital",
      "hospitalCity": "Mumbai",
      "hospitalState": "Maharashtra"
    },
    "eligibleDonors": [
      {
        "id": "test_donor_1",
        "bloodGroup": "A_POSITIVE",
        "city": "Mumbai",
        "state": "Maharashtra",
        "dateOfBirth": "1990-05-15",
        "gender": "Male",
        "donationCount": 5,
        "isAvailable": true
      }
    ],
    "maxResults": 10
  }'
```

### Step 9: Update DonorHub Frontend

In your `donorhub/.env.local`, add:

```dotenv
ML_SERVICE_URL=https://YOUR_USERNAME.pythonanywhere.com
ML_SERVICE_API_KEY=YOUR_SECURE_API_KEY
```

---

## Troubleshooting

### Model not loading

**Symptoms**: Health endpoint shows `"status": "degraded"`

**Solutions**:
1. Verify model file exists:
   ```bash
   ls -la ~/donorhub-ml-services/models/
   ```
2. Check `ML_MODEL_PATH` in WSGI config uses absolute path
3. Check error logs in Web tab → Error log

### 401 Unauthorized

**Symptoms**: API calls return 401 error

**Solutions**:
1. Verify `X-ML-API-KEY` header matches `ML_API_KEY` in WSGI config
2. Ensure `DEBUG` is set to `'false'` (string, not boolean) in production
3. Check the API key doesn't have extra whitespace

### CORS Errors

**Symptoms**: Browser console shows CORS blocked errors

**Solutions**:
1. Add your frontend domain to `ALLOWED_ORIGINS_STR`
2. Include both `http://` and `https://` if needed
3. Don't include trailing slashes in origins
4. Reload the web app after changes

### 500 Internal Server Error

**Symptoms**: Server returns 500 error

**Solutions**:
1. Check error log in Web tab → Error log
2. Verify all dependencies installed: `pip list`
3. Check Python version: `python --version` (must be 3.10.x)
4. Verify model file is not corrupted

### Virtual Environment Issues

**Symptoms**: Module not found errors

**Solutions**:
1. Verify virtualenv path in Web tab is correct
2. Re-install dependencies:
   ```bash
   workon donorhub-ml-env
   pip install -r ~/donorhub-ml-services/requirements.txt
   ```
3. Reload web app

---

## Example API Requests

### Rank Donors

```bash
curl -X POST http://localhost:8000/api/v1/match/rank \
  -H "Content-Type: application/json" \
  -H "X-ML-API-KEY: your-api-key" \
  -d '{
    "bloodRequest": {
      "id": "req_123",
      "bloodGroup": "A_POSITIVE",
      "urgency": "HIGH",
      "unitsRequired": 2,
      "hospital": "City Hospital",
      "hospitalCity": "Mumbai",
      "hospitalState": "Maharashtra"
    },
    "eligibleDonors": [
      {
        "id": "donor_1",
        "bloodGroup": "A_POSITIVE",
        "city": "Mumbai",
        "state": "Maharashtra",
        "lastDonation": "2025-10-01T00:00:00Z",
        "dateOfBirth": "1990-05-15",
        "gender": "Male",
        "donationCount": 5,
        "isAvailable": true
      }
    ],
    "maxResults": 20
  }'
```

### Response

```json
{
  "success": true,
  "data": {
    "rankedDonors": [
      {
        "donorId": "donor_1",
        "matchScore": 0.87,
        "matchReason": "Exact blood match, nearby location, excellent donation history",
        "factors": {
          "bloodCompatibility": 1.0,
          "locationProximity": 1.0,
          "recencyFactor": 0.85,
          "donationHistory": 0.85,
          "urgencyBoost": 0.93
        }
      }
    ],
    "metadata": {
      "totalCandidates": 1,
      "processingTimeMs": 45,
      "modelVersion": "v1.2.0"
    }
  }
}
```

### Match Score (Single Donor)

```bash
curl -X POST http://localhost:8000/api/v1/match/score \
  -H "Content-Type: application/json" \
  -H "X-ML-API-KEY: your-api-key" \
  -d '{
    "donorId": "donor_1",
    "bloodRequestId": "req_123",
    "donor": {
      "bloodGroup": "A_POSITIVE",
      "city": "Mumbai",
      "state": "Maharashtra",
      "lastDonation": "2025-10-01T00:00:00Z",
      "dateOfBirth": "1990-05-15",
      "gender": "Male"
    },
    "bloodRequest": {
      "bloodGroup": "A_POSITIVE",
      "urgency": "HIGH",
      "hospital": "City Hospital",
      "hospitalCity": "Mumbai",
      "hospitalState": "Maharashtra"
    }
  }'
```

### Availability Prediction

```bash
curl -X POST http://localhost:8000/api/v1/predict/availability \
  -H "Content-Type: application/json" \
  -H "X-ML-API-KEY: your-api-key" \
  -d '{
    "donorId": "donor_1",
    "donorProfile": {
      "lastDonation": "2025-10-01T00:00:00Z",
      "donationCount": 5,
      "responseRate": 0.8,
      "preferredContactTime": "MORNING"
    },
    "requestContext": {
      "urgency": "HIGH",
      "requestDate": "2026-02-03T00:00:00Z"
    }
  }'
```

---

## Scoring Algorithm

The ranking uses a hybrid approach:

1. **ML Score (60%)**: From `predict_proba` on the trained model
2. **Rule-based Score (40%)**: Weighted factors:
   - Blood compatibility: 30%
   - Location proximity: 25%
   - Recency factor: 20%
   - Donation history: 15%
   - Urgency boost: 10%

## Feature Vector (26 features)

| Features | Count |
|----------|-------|
| Donor blood group (one-hot) | 8 |
| Request blood group (one-hot) | 8 |
| Urgency level normalized | 1 |
| Days since last donation | 1 |
| Donor age normalized | 1 |
| Location match score | 1 |
| Donation count normalized | 1 |
| Blood compatibility flag | 1 |
| Exact blood match flag | 1 |
| Days until deadline | 1 |
| Is available flag | 1 |
| **Total** | **26** |

---

## Security Notes

- **API Key**: All POST endpoints require `X-ML-API-KEY` header in production
- **Debug Mode**: Set `DEBUG=false` in production to enforce authentication
- **Origin Validation**: Requests validated against `ALLOWED_ORIGINS_STR`
- **CORS**: Restricted to configured origins only
- **Stateless**: No database access, pure ML inference

---

## Quick Reference

### Local Development Commands

```bash
# Activate virtual environment
.\venv\Scripts\Activate.ps1  # Windows PowerShell
source venv/bin/activate      # Linux/Mac

# Run service
python wsgi_app.py

# Test health
curl http://localhost:8000/api/v1/health
```

### PythonAnywhere Commands

```bash
# Activate virtual environment
workon donorhub-ml-env

# Check installed packages
pip list

# View error logs
cat /var/log/YOUR_USERNAME.pythonanywhere.com.error.log

# Reinstall dependencies
pip install -r ~/donorhub-ml-services/requirements.txt
```

---

## License

Proprietary - DonorHub
