"""
Flask WSGI wrapper for DonorHub ML Service.
Complete implementation matching the FastAPI version for PythonAnywhere deployment.

Endpoints:
- GET  /                        - Root info
- GET  /api/v1/health          - Health check
- POST /api/v1/match/rank      - Rank eligible donors for a blood request
- POST /api/v1/match/score     - Detailed score for a donor-request pair
- POST /api/v1/predict/availability - Predict donor availability
"""

import os
import time
import joblib
import numpy as np
from datetime import datetime, date
from flask import Flask, request, jsonify
from functools import wraps
from typing import Dict, List, Optional, Tuple, Any

# Create Flask app
app = Flask(__name__)

# ============================================================================
# Configuration
# ============================================================================

ML_API_KEY = os.environ.get('ML_API_KEY', '')
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS_STR', 'http://localhost:3000').split(',')
MODEL_PATH = os.environ.get('ML_MODEL_PATH', 'models/donor_ranker.joblib')
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
SERVICE_VERSION = os.environ.get('SERVICE_VERSION', '1.0.0')
MODEL_VERSION = os.environ.get('ML_MODEL_VERSION', 'v1.2.0')

# Global state
_model = None
_model_loaded = False
_start_time = datetime.now()


# ============================================================================
# Blood Compatibility Matrix
# ============================================================================

BLOOD_COMPATIBILITY = {
    'A_POSITIVE': ['A_POSITIVE', 'A_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'],
    'A_NEGATIVE': ['A_NEGATIVE', 'O_NEGATIVE'],
    'B_POSITIVE': ['B_POSITIVE', 'B_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'],
    'B_NEGATIVE': ['B_NEGATIVE', 'O_NEGATIVE'],
    'AB_POSITIVE': ['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 
                   'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE'],
    'AB_NEGATIVE': ['A_NEGATIVE', 'B_NEGATIVE', 'AB_NEGATIVE', 'O_NEGATIVE'],
    'O_POSITIVE': ['O_POSITIVE', 'O_NEGATIVE'],
    'O_NEGATIVE': ['O_NEGATIVE'],
}

URGENCY_VALUES = {
    'LOW': 1,
    'MEDIUM': 2,
    'HIGH': 3,
    'CRITICAL': 4,
}

BLOOD_GROUP_INDEX = {
    'A_POSITIVE': 0, 'A_NEGATIVE': 1,
    'B_POSITIVE': 2, 'B_NEGATIVE': 3,
    'AB_POSITIVE': 4, 'AB_NEGATIVE': 5,
    'O_POSITIVE': 6, 'O_NEGATIVE': 7,
}


# ============================================================================
# Model Loading
# ============================================================================

def get_model():
    """Lazy load the ML model."""
    global _model, _model_loaded
    if not _model_loaded:
        try:
            print(f"Loading model from: {MODEL_PATH}")
            _model = joblib.load(MODEL_PATH)
            _model_loaded = True
            print("Model loaded successfully")
        except Exception as e:
            print(f"Failed to load model: {e}")
            _model = None
    return _model


# ============================================================================
# CORS and Authentication
# ============================================================================

def add_cors_headers(response):
    """Add CORS headers to response."""
    origin = request.headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS or DEBUG or not ALLOWED_ORIGINS[0]:
        response.headers['Access-Control-Allow-Origin'] = origin or '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-ML-API-KEY'
    return response


@app.after_request
def after_request(response):
    return add_cors_headers(response)


def require_api_key(f):
    """Decorator to require API key."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if DEBUG and not ML_API_KEY:
            return f(*args, **kwargs)
        
        api_key = request.headers.get('X-ML-API-KEY')
        if not api_key:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'MISSING_API_KEY',
                    'message': 'X-ML-API-KEY header is required'
                }
            }), 401
        
        if api_key != ML_API_KEY:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'INVALID_API_KEY',
                    'message': 'Invalid API key provided'
                }
            }), 401
        
        return f(*args, **kwargs)
    return decorated


# ============================================================================
# Utility Functions
# ============================================================================

def calculate_age(dob_str: str) -> int:
    """Calculate age from date of birth string (YYYY-MM-DD)."""
    try:
        dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return max(0, age)
    except (ValueError, AttributeError, TypeError):
        return 30


def days_since(dt_str: Optional[str]) -> Optional[int]:
    """Calculate days since a given datetime string."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
        return max(0, (now - dt).days)
    except:
        return None


def is_blood_compatible(recipient_blood: str, donor_blood: str) -> bool:
    """Check if donor blood is compatible with recipient."""
    return donor_blood in BLOOD_COMPATIBILITY.get(recipient_blood, [])


def is_exact_blood_match(recipient_blood: str, donor_blood: str) -> bool:
    """Check if blood types are exactly the same."""
    return recipient_blood == donor_blood


def is_donation_eligible(last_donation_str: Optional[str], min_days: int = 56) -> bool:
    """Check if donor is eligible based on 56-day rule."""
    if not last_donation_str:
        return True
    days = days_since(last_donation_str)
    return days is not None and days >= min_days


def location_match_score(donor_city: str, donor_state: str, 
                         hospital_city: str, hospital_state: str) -> float:
    """Calculate location proximity score (0.0 to 1.0)."""
    donor_city_norm = (donor_city or '').strip().lower()
    donor_state_norm = (donor_state or '').strip().lower()
    hospital_city_norm = (hospital_city or '').strip().lower()
    hospital_state_norm = (hospital_state or '').strip().lower()
    
    if donor_city_norm == hospital_city_norm and donor_state_norm == hospital_state_norm:
        return 1.0
    elif donor_state_norm == hospital_state_norm:
        return 0.7
    else:
        return 0.3


def blood_group_one_hot(blood_group: str) -> List[float]:
    """Convert blood group to one-hot encoded vector."""
    vec = [0.0] * 8
    idx = BLOOD_GROUP_INDEX.get(blood_group, 0)
    vec[idx] = 1.0
    return vec


# ============================================================================
# Feature Extraction (matches original predictor.py exactly)
# ============================================================================

def extract_donor_features(donor: dict, blood_request: dict) -> np.ndarray:
    """
    Extract feature vector for a donor-request pair.
    26 features total - matches original predictor.py
    """
    features = []
    
    donor_blood = donor.get('bloodGroup', 'O_POSITIVE')
    request_blood = blood_request.get('bloodGroup', 'O_POSITIVE')
    urgency = blood_request.get('urgency', 'MEDIUM')
    
    # Donor blood group one-hot (8 features)
    features.extend(blood_group_one_hot(donor_blood))
    
    # Request blood group one-hot (8 features)
    features.extend(blood_group_one_hot(request_blood))
    
    # Urgency level normalized (1 feature)
    urgency_val = URGENCY_VALUES.get(urgency, 2)
    features.append(urgency_val / 4.0)
    
    # Days since last donation normalized (1 feature)
    days_donation = days_since(donor.get('lastDonation'))
    if days_donation is None:
        days_donation = 365
    features.append(min(days_donation / 365.0, 1.0))
    
    # Donor age normalized (1 feature)
    age = calculate_age(donor.get('dateOfBirth', '1990-01-01'))
    features.append(min(age / 65.0, 1.0))
    
    # Location match score (1 feature)
    loc_score = location_match_score(
        donor.get('city', ''),
        donor.get('state', ''),
        blood_request.get('hospitalCity', ''),
        blood_request.get('hospitalState', '')
    )
    features.append(loc_score)
    
    # Donation count normalized (1 feature)
    donation_count = donor.get('donationCount', 0)
    features.append(min(donation_count / 20.0, 1.0))
    
    # Blood compatibility (1 feature)
    is_compat = 1.0 if is_blood_compatible(request_blood, donor_blood) else 0.0
    features.append(is_compat)
    
    # Exact blood match (1 feature)
    is_exact = 1.0 if donor_blood == request_blood else 0.0
    features.append(is_exact)
    
    # Days until deadline normalized (1 feature)
    required_by = blood_request.get('requiredBy')
    if required_by:
        days_until = days_since(required_by)
        if days_until is not None:
            features.append(min(abs(days_until) / 30.0, 1.0))
        else:
            features.append(0.5)
    else:
        features.append(0.5)
    
    # Is available (1 feature)
    is_available = 1.0 if donor.get('isAvailable', True) else 0.0
    features.append(is_available)
    
    return np.array(features, dtype=np.float32)


def predict_match_score(features: np.ndarray, model: Any) -> float:
    """
    Run inference on the model and return a normalized score.
    Tries predict_proba, then decision_function, then predict.
    """
    features_2d = features.reshape(1, -1)
    
    try:
        if hasattr(model, 'predict_proba'):
            proba = model.predict_proba(features_2d)
            if proba.shape[1] >= 2:
                return float(proba[0, 1])
            return float(proba[0, 0])
    except Exception as e:
        print(f"predict_proba failed: {e}")
    
    try:
        if hasattr(model, 'decision_function'):
            score = model.decision_function(features_2d)
            return float(1.0 / (1.0 + np.exp(-score[0])))
    except Exception as e:
        print(f"decision_function failed: {e}")
    
    try:
        if hasattr(model, 'predict'):
            pred = model.predict(features_2d)
            score = float(pred[0])
            return max(0.0, min(1.0, score))
    except Exception as e:
        print(f"predict failed: {e}")
    
    return 0.5


# ============================================================================
# Factor Breakdown Calculation
# ============================================================================

def compute_factor_breakdown(donor: dict, blood_request: dict) -> dict:
    """Compute individual factor scores for a donor-request pair."""
    donor_blood = donor.get('bloodGroup', 'O_POSITIVE')
    request_blood = blood_request.get('bloodGroup', 'O_POSITIVE')
    urgency = blood_request.get('urgency', 'MEDIUM')
    
    # Blood compatibility
    is_compat = is_blood_compatible(request_blood, donor_blood)
    is_exact = is_exact_blood_match(request_blood, donor_blood)
    blood_score = 1.0 if is_exact else (0.8 if is_compat else 0.0)
    
    # Location proximity
    loc_score = location_match_score(
        donor.get('city', ''),
        donor.get('state', ''),
        blood_request.get('hospitalCity', ''),
        blood_request.get('hospitalState', '')
    )
    
    # Recency factor
    days_donation = days_since(donor.get('lastDonation'))
    if days_donation is None:
        recency_score = 1.0
    elif days_donation >= 56:
        recency_score = min(0.7 + (days_donation - 56) / 300.0 * 0.3, 1.0)
    else:
        recency_score = days_donation / 56.0 * 0.5
    
    # Donation history
    donation_count = donor.get('donationCount', 0)
    if donation_count >= 10:
        history_score = 1.0
    elif donation_count >= 5:
        history_score = 0.85
    elif donation_count >= 2:
        history_score = 0.7
    elif donation_count >= 1:
        history_score = 0.6
    else:
        history_score = 0.4
    
    # Urgency boost
    urgency_val = URGENCY_VALUES.get(urgency, 2)
    urgency_boost = 0.7 + (urgency_val / 4.0) * 0.3
    
    return {
        'bloodCompatibility': round(blood_score, 2),
        'locationProximity': round(loc_score, 2),
        'recencyFactor': round(recency_score, 2),
        'donationHistory': round(history_score, 2),
        'urgencyBoost': round(urgency_boost, 2)
    }


def generate_match_reason(factors: dict, is_exact_match: bool) -> str:
    """Generate a human-readable match reason."""
    reasons = []
    
    if factors['bloodCompatibility'] >= 1.0:
        reasons.append("Exact blood match")
    elif factors['bloodCompatibility'] >= 0.8:
        reasons.append("Compatible blood type")
    
    if factors['locationProximity'] >= 0.9:
        reasons.append("nearby location")
    elif factors['locationProximity'] >= 0.7:
        reasons.append("same state")
    
    if factors['donationHistory'] >= 0.85:
        reasons.append("excellent donation history")
    elif factors['donationHistory'] >= 0.6:
        reasons.append("good donation history")
    
    if factors['recencyFactor'] >= 0.9:
        reasons.append("fully eligible")
    elif factors['recencyFactor'] >= 0.7:
        reasons.append("recently eligible")
    
    if not reasons:
        return "Potential donor match"
    
    return ", ".join(reasons).capitalize()


# ============================================================================
# Rank Donors (core ranking logic from original predictor.py)
# ============================================================================

def rank_donors_internal(blood_request: dict, donors: List[dict], max_results: int = 20) -> List[dict]:
    """
    Rank donors for a blood request using ML model + rule-based scoring.
    This matches the original rank_donors function in predictor.py
    """
    model = get_model()
    scored_donors = []
    
    for donor in donors:
        donor_blood = donor.get('bloodGroup', 'O_POSITIVE')
        request_blood = blood_request.get('bloodGroup', 'O_POSITIVE')
        
        # Skip incompatible donors
        if not is_blood_compatible(request_blood, donor_blood):
            continue
        
        # Skip unavailable donors
        if not donor.get('isAvailable', True):
            continue
        
        # Extract features and get ML prediction
        features = extract_donor_features(donor, blood_request)
        
        if model is not None:
            ml_score = predict_match_score(features, model)
        else:
            ml_score = 0.5
        
        # Compute factor breakdown
        factors = compute_factor_breakdown(donor, blood_request)
        
        # Combine ML score with rule-based factors (60% ML, 40% rule-based)
        # This matches the original predictor.py logic
        rule_score = (
            factors['bloodCompatibility'] * 0.3 +
            factors['locationProximity'] * 0.25 +
            factors['recencyFactor'] * 0.2 +
            factors['donationHistory'] * 0.15 +
            (factors['urgencyBoost'] - 0.7) / 0.3 * 0.1
        )
        
        final_score = 0.6 * ml_score + 0.4 * rule_score
        final_score = max(0.0, min(1.0, final_score))
        
        scored_donors.append({
            'donor': donor,
            'score': final_score,
            'factors': factors
        })
    
    # Sort by score descending
    scored_donors.sort(key=lambda x: x['score'], reverse=True)
    
    # Build result list
    ranked = []
    for item in scored_donors[:max_results]:
        donor = item['donor']
        factors = item['factors']
        is_exact = is_exact_blood_match(
            blood_request.get('bloodGroup', 'O_POSITIVE'),
            donor.get('bloodGroup', 'O_POSITIVE')
        )
        reason = generate_match_reason(factors, is_exact)
        
        ranked.append({
            'donorId': donor.get('id'),
            'matchScore': round(item['score'], 2),
            'matchReason': reason,
            'factors': factors
        })
    
    return ranked


# ============================================================================
# Detailed Score Calculation (from original predictor.py compute_single_match_score)
# ============================================================================

def compute_detailed_score(donor: dict, blood_request: dict) -> Tuple[float, dict, str]:
    """
    Compute detailed match score for a single donor-request pair.
    Returns (score, breakdown, recommendation)
    """
    donor_blood = donor.get('bloodGroup', 'O_POSITIVE')
    request_blood = blood_request.get('bloodGroup', 'O_POSITIVE')
    urgency = blood_request.get('urgency', 'MEDIUM')
    
    # Blood compatibility breakdown
    is_compat = is_blood_compatible(request_blood, donor_blood)
    is_exact = is_exact_blood_match(request_blood, donor_blood)
    blood_score = 1.0 if is_exact else (0.8 if is_compat else 0.0)
    
    blood_breakdown = {
        'score': round(blood_score, 2),
        'isExactMatch': is_exact,
        'isCompatible': is_compat
    }
    
    # Location proximity breakdown
    loc_score = location_match_score(
        donor.get('city', ''),
        donor.get('state', ''),
        blood_request.get('hospitalCity', ''),
        blood_request.get('hospitalState', '')
    )
    same_city = (donor.get('city', '').strip().lower() == 
                 blood_request.get('hospitalCity', '').strip().lower())
    
    if same_city:
        distance = "5km"
    elif loc_score >= 0.7:
        distance = "50km"
    else:
        distance = "200km+"
    
    location_breakdown = {
        'score': round(loc_score, 2),
        'distance': distance,
        'sameCity': same_city
    }
    
    # Donation eligibility breakdown
    days_donation = days_since(donor.get('lastDonation'))
    is_eligible = is_donation_eligible(donor.get('lastDonation'))
    
    if days_donation is None:
        eligibility_score = 1.0
    elif is_eligible:
        eligibility_score = min(0.7 + (days_donation - 56) / 300.0 * 0.3, 1.0)
    else:
        eligibility_score = days_donation / 56.0 * 0.5
    
    eligibility_breakdown = {
        'score': round(eligibility_score, 2),
        'daysSinceLastDonation': days_donation,
        'isEligible': is_eligible
    }
    
    # Urgency alignment breakdown
    urgency_val = URGENCY_VALUES.get(urgency, 2)
    urgency_score = 0.6 + (urgency_val / 4.0) * 0.4
    priority_boost = 1.0 + (urgency_val - 2) * 0.1
    
    urgency_breakdown = {
        'score': round(urgency_score, 2),
        'urgencyLevel': urgency,
        'priorityBoost': round(priority_boost, 2)
    }
    
    breakdown = {
        'bloodCompatibility': blood_breakdown,
        'locationProximity': location_breakdown,
        'donationEligibility': eligibility_breakdown,
        'urgencyAlignment': urgency_breakdown
    }
    
    # Calculate overall score
    overall_score = (
        blood_score * 0.35 +
        loc_score * 0.25 +
        eligibility_score * 0.25 +
        urgency_score * 0.15
    )
    overall_score *= priority_boost
    overall_score = max(0.0, min(1.0, overall_score))
    
    # Determine recommendation
    if not is_compat:
        recommendation = "NOT_RECOMMENDED"
    elif overall_score >= 0.85:
        recommendation = "HIGHLY_RECOMMENDED"
    elif overall_score >= 0.65:
        recommendation = "RECOMMENDED"
    elif overall_score >= 0.45:
        recommendation = "CONDITIONAL"
    else:
        recommendation = "NOT_RECOMMENDED"
    
    return round(overall_score, 2), breakdown, recommendation


def generate_detailed_reason(score: float, breakdown: dict, recommendation: str) -> str:
    """Generate detailed match reason for single score."""
    parts = []
    
    if recommendation == "HIGHLY_RECOMMENDED":
        parts.append("Excellent match")
    elif recommendation == "RECOMMENDED":
        parts.append("Good match")
    elif recommendation == "CONDITIONAL":
        parts.append("Conditional match")
    else:
        parts.append("Not recommended")
    
    details = []
    
    if breakdown['bloodCompatibility']['isExactMatch']:
        details.append("exact blood type")
    elif breakdown['bloodCompatibility']['isCompatible']:
        details.append("compatible blood type")
    else:
        details.append("incompatible blood type")
    
    if breakdown['locationProximity']['sameCity']:
        details.append("same city")
    elif breakdown['locationProximity']['score'] >= 0.7:
        details.append("same state")
    
    if breakdown['donationEligibility']['isEligible']:
        details.append("eligible for donation")
    else:
        details.append("not yet eligible")
    
    if details:
        parts.append(": " + ", ".join(details))
    
    return "".join(parts)


# ============================================================================
# Availability Prediction (from original predictor.py predict_availability)
# ============================================================================

def predict_availability_internal(donor_profile: dict, request_context: dict) -> dict:
    """
    Predict donor availability likelihood.
    Returns dict with probability, confidence, factors, suggested time, recommendation
    """
    # Historical response factor
    historical_response = donor_profile.get('responseRate', 0.5)
    
    # Time since last contact factor
    days_contact = days_since(donor_profile.get('lastContactedAt'))
    if days_contact is None:
        time_since_contact = 0.5
    elif days_contact > 90:
        time_since_contact = 0.9
    elif days_contact > 30:
        time_since_contact = 0.7
    elif days_contact > 7:
        time_since_contact = 0.5
    else:
        time_since_contact = 0.3
    
    # Donation eligibility factor
    is_eligible = is_donation_eligible(donor_profile.get('lastDonation'))
    days_donation = days_since(donor_profile.get('lastDonation'))
    
    if not is_eligible:
        eligibility_factor = 0.2
    elif days_donation is None:
        eligibility_factor = 0.9
    elif days_donation > 180:
        eligibility_factor = 1.0
    elif days_donation > 90:
        eligibility_factor = 0.9
    else:
        eligibility_factor = 0.7
    
    # Urgency response boost
    urgency = request_context.get('urgency', 'MEDIUM')
    urgency_val = URGENCY_VALUES.get(urgency, 2)
    urgency_boost = 0.6 + (urgency_val / 4.0) * 0.4
    
    factors = {
        'historicalResponse': round(historical_response, 2),
        'timeSinceLastContact': round(time_since_contact, 2),
        'donationEligibility': round(eligibility_factor, 2),
        'urgencyResponseBoost': round(urgency_boost, 2)
    }
    
    # Calculate probability
    probability = (
        historical_response * 0.4 +
        time_since_contact * 0.2 +
        eligibility_factor * 0.25 +
        urgency_boost * 0.15
    )
    probability = max(0.0, min(1.0, probability))
    
    # Confidence calculation
    confidence_factors = []
    if donor_profile.get('responseRate', 0) > 0:
        confidence_factors.append(0.9)
    else:
        confidence_factors.append(0.5)
    
    donation_count = donor_profile.get('donationCount', 0)
    if donation_count > 5:
        confidence_factors.append(0.9)
    elif donation_count > 0:
        confidence_factors.append(0.7)
    else:
        confidence_factors.append(0.4)
    
    if donor_profile.get('lastContactedAt'):
        confidence_factors.append(0.8)
    else:
        confidence_factors.append(0.5)
    
    confidence = sum(confidence_factors) / len(confidence_factors)
    
    # Suggested contact time
    preferred_time = donor_profile.get('preferredContactTime', 'ANY')
    if preferred_time == 'ANY':
        if urgency in ['CRITICAL', 'HIGH']:
            suggested_time = 'MORNING'
        else:
            suggested_time = 'AFTERNOON'
    else:
        suggested_time = preferred_time
    
    # Generate recommendation
    if probability >= 0.7:
        recommendation = "Contact donor - high likelihood of positive response"
    elif probability >= 0.5:
        recommendation = "Consider contacting - moderate likelihood of response"
    elif probability >= 0.3:
        recommendation = "Low priority contact - limited availability expected"
    else:
        recommendation = "Not recommended - unlikely to respond positively"
    
    return {
        'availabilityProbability': round(probability, 2),
        'confidence': round(confidence, 2),
        'factors': factors,
        'suggestedContactTime': suggested_time,
        'recommendation': recommendation
    }


# ============================================================================
# API Endpoints
# ============================================================================

@app.route('/')
def root():
    """Root endpoint - service info."""
    return jsonify({
        'service': 'DonorHub ML Service',
        'version': SERVICE_VERSION,
        'health_check': '/api/v1/health',
        'endpoints': {
            'health': 'GET /api/v1/health',
            'rank': 'POST /api/v1/match/rank',
            'score': 'POST /api/v1/match/score',
            'availability': 'POST /api/v1/predict/availability'
        }
    })


@app.route('/api/v1/health')
def health():
    """Health check endpoint - no auth required."""
    model = get_model()
    uptime = int((datetime.now() - _start_time).total_seconds())
    
    return jsonify({
        'status': 'healthy' if model is not None else 'degraded',
        'version': SERVICE_VERSION,
        'modelVersion': MODEL_VERSION,
        'uptime': uptime,
        'lastModelUpdate': '2026-01-15T00:00:00Z'
    })


@app.route('/api/v1/match/rank', methods=['POST', 'OPTIONS'])
@require_api_key
def rank_donors():
    """
    Rank eligible donors for a blood request.
    
    Request: { bloodRequest, eligibleDonors, maxResults }
    Response: { success, data: { rankedDonors, metadata } }
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    start_time = time.time()
    
    model = get_model()
    if model is None:
        return jsonify({
            'success': False,
            'error': {
                'code': 'MODEL_NOT_LOADED',
                'message': 'ML model is not available'
            }
        }), 503
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Request body is required'
                }
            }), 400
        
        blood_request = data.get('bloodRequest', {})
        eligible_donors = data.get('eligibleDonors', [])
        max_results = data.get('maxResults', 20)
        
        if not blood_request.get('bloodGroup'):
            return jsonify({
                'success': False,
                'error': {
                    'code': 'INVALID_BLOOD_GROUP',
                    'message': 'Invalid blood group provided'
                }
            }), 400
        
        # Rank donors
        ranked_donors = rank_donors_internal(blood_request, eligible_donors, max_results)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return jsonify({
            'success': True,
            'data': {
                'rankedDonors': ranked_donors,
                'metadata': {
                    'totalCandidates': len(eligible_donors),
                    'processingTimeMs': processing_time,
                    'modelVersion': MODEL_VERSION
                }
            }
        })
    
    except Exception as e:
        print(f"Rank donors error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': f'Error processing rank request: {str(e)}'
            }
        }), 500


@app.route('/api/v1/match/score', methods=['POST', 'OPTIONS'])
@require_api_key
def match_score():
    """
    Get detailed match score for a donor-request pair.
    
    Request: { donorId, bloodRequestId, donor, bloodRequest }
    Response: { success, data: { matchScore, matchReason, breakdown, recommendation } }
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Request body is required'
                }
            }), 400
        
        donor = data.get('donor', {})
        blood_request = data.get('bloodRequest', {})
        
        score, breakdown, recommendation = compute_detailed_score(donor, blood_request)
        reason = generate_detailed_reason(score, breakdown, recommendation)
        
        return jsonify({
            'success': True,
            'data': {
                'matchScore': score,
                'matchReason': reason,
                'breakdown': breakdown,
                'recommendation': recommendation
            }
        })
    
    except Exception as e:
        print(f"Match score error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': f'Error computing match score: {str(e)}'
            }
        }), 500


@app.route('/api/v1/predict/availability', methods=['POST', 'OPTIONS'])
@require_api_key
def availability():
    """
    Predict donor availability likelihood.
    
    Request: { donorId, donorProfile, requestContext }
    Response: { success, data: { availabilityProbability, confidence, factors, suggestedContactTime, recommendation } }
    """
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'INVALID_REQUEST',
                    'message': 'Request body is required'
                }
            }), 400
        
        donor_profile = data.get('donorProfile', {})
        request_context = data.get('requestContext', {})
        
        result = predict_availability_internal(donor_profile, request_context)
        
        return jsonify({
            'success': True,
            'data': result
        })
    
    except Exception as e:
        print(f"Availability prediction error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': f'Error predicting availability: {str(e)}'
            }
        }), 500


# ============================================================================
# WSGI Application Entry Point
# ============================================================================

application = app

if __name__ == '__main__':
    app.run(debug=DEBUG, host='0.0.0.0', port=8000)
