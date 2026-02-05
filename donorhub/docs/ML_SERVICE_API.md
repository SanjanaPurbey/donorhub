# DonorHub ML Service API Specification

This document outlines the ML service endpoints that the DonorHub frontend expects to consume.

---

## Base Configuration

The ML service URL should be set in environment variables:

```env
ML_SERVICE_URL=http://localhost:8000
```

---

## Endpoints Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/match/rank` | POST | Rank eligible donors for a blood request |
| `/api/v1/match/score` | POST | Get match score for a specific donor-request pair |
| `/api/v1/predict/availability` | POST | Predict donor availability likelihood |
| `/api/v1/health` | GET | Health check for the ML service |

---

## 1. Donor Ranking Endpoint

### `POST /api/v1/match/rank`

Ranks a list of eligible donors for a specific blood request based on ML scoring.

#### Request

```json
{
  "bloodRequest": {
    "id": "string",
    "bloodGroup": "A_POSITIVE" | "A_NEGATIVE" | "B_POSITIVE" | "B_NEGATIVE" | "AB_POSITIVE" | "AB_NEGATIVE" | "O_POSITIVE" | "O_NEGATIVE",
    "urgency": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "unitsRequired": 2,
    "hospital": "City Hospital",
    "hospitalCity": "Mumbai",
    "hospitalState": "Maharashtra",
    "requiredBy": "2026-02-15T00:00:00Z" // ISO 8601, nullable
  },
  "eligibleDonors": [
    {
      "id": "donor_123",
      "bloodGroup": "A_POSITIVE",
      "city": "Mumbai",
      "state": "Maharashtra",
      "lastDonation": "2025-10-01T00:00:00Z", // ISO 8601, nullable
      "dateOfBirth": "1990-05-15",
      "gender": "Male" | "Female" | "Other",
      "donationCount": 5, // Total lifetime donations
      "isAvailable": true
    }
  ],
  "maxResults": 20 // Optional, default 20
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "rankedDonors": [
      {
        "donorId": "donor_123",
        "matchScore": 0.95, // 0.0 to 1.0
        "matchReason": "Exact blood match, nearby location, good donation history",
        "factors": {
          "bloodCompatibility": 1.0,
          "locationProximity": 0.9,
          "recencyFactor": 0.85,
          "donationHistory": 0.95,
          "urgencyBoost": 1.0
        }
      }
    ],
    "metadata": {
      "totalCandidates": 15,
      "processingTimeMs": 45,
      "modelVersion": "v1.2.0"
    }
  }
}
```

#### Error Response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_BLOOD_GROUP",
    "message": "Invalid blood group provided"
  }
}
```

---

## 2. Single Match Score Endpoint

### `POST /api/v1/match/score`

Get a detailed match score for a specific donor-request pair.

#### Request

```json
{
  "donorId": "donor_123",
  "bloodRequestId": "request_456",
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
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "matchScore": 0.92,
    "matchReason": "Excellent match: exact blood type, same city, eligible for donation",
    "breakdown": {
      "bloodCompatibility": {
        "score": 1.0,
        "isExactMatch": true,
        "isCompatible": true
      },
      "locationProximity": {
        "score": 0.95,
        "distance": "5km",
        "sameCity": true
      },
      "donationEligibility": {
        "score": 0.9,
        "daysSinceLastDonation": 120,
        "isEligible": true
      },
      "urgencyAlignment": {
        "score": 0.85,
        "urgencyLevel": "HIGH",
        "priorityBoost": 1.2
      }
    },
    "recommendation": "HIGHLY_RECOMMENDED" | "RECOMMENDED" | "CONDITIONAL" | "NOT_RECOMMENDED"
  }
}
```

---

## 3. Availability Prediction Endpoint

### `POST /api/v1/predict/availability`

Predict the likelihood of a donor being available and willing to donate.

#### Request

```json
{
  "donorId": "donor_123",
  "donorProfile": {
    "lastDonation": "2025-10-01T00:00:00Z",
    "donationCount": 5,
    "responseRate": 0.8, // Historical response rate (0-1)
    "lastContactedAt": "2025-12-15T00:00:00Z",
    "preferredContactTime": "MORNING" | "AFTERNOON" | "EVENING" | "ANY"
  },
  "requestContext": {
    "urgency": "CRITICAL",
    "requestDate": "2026-01-28T00:00:00Z"
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "availabilityProbability": 0.75,
    "confidence": 0.85,
    "factors": {
      "historicalResponse": 0.8,
      "timeSinceLastContact": 0.7,
      "donationEligibility": 1.0,
      "urgencyResponseBoost": 0.9
    },
    "suggestedContactTime": "MORNING",
    "recommendation": "Contact donor - high likelihood of positive response"
  }
}
```

---

## 4. Health Check Endpoint

### `GET /api/v1/health`

Check if the ML service is running and ready.

#### Response

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "modelVersion": "v1.2.0",
  "uptime": 86400,
  "lastModelUpdate": "2026-01-15T00:00:00Z"
}
```

---

## Data Types Reference

### Blood Groups (Enum)

```
A_POSITIVE, A_NEGATIVE, B_POSITIVE, B_NEGATIVE, 
AB_POSITIVE, AB_NEGATIVE, O_POSITIVE, O_NEGATIVE
```

### Urgency Levels (Enum)

```
LOW, MEDIUM, HIGH, CRITICAL
```

### Gender (Enum)

```
Male, Female, Other
```

---

## Blood Compatibility Matrix (Reference)

For your ML model training, here's the blood compatibility matrix (recipient → compatible donors):

| Recipient | Compatible Donors |
|-----------|-------------------|
| A+ | A+, A-, O+, O- |
| A- | A-, O- |
| B+ | B+, B-, O+, O- |
| B- | B-, O- |
| AB+ | A+, A-, B+, B-, AB+, AB-, O+, O-, (Universal recipient) |
| AB- | A-, B-, AB-, O- |
| O+ | O+, O- |
| O- | O- (Universal donor) |

---

## Integration Notes

### Current Rule-Based Logic (to enhance with ML)

The current system uses these rules that your ML model should consider:

1. **Blood type compatibility** - Must be compatible per the matrix above
2. **Availability** - Donor must be marked as available
3. **56-day rule** - Must be 56+ days since last donation
4. **Location** - Prioritize donors in the same city/state as the hospital

### Suggested ML Features

For your ranking model, consider these features:

1. **Donor Features:**
   - Blood group (one-hot encoded)
   - Days since last donation
   - Total donation count
   - Age (from DOB)
   - Location (lat/long if available, or city/state encoding)
   - Historical response rate

2. **Request Features:**
   - Blood group needed
   - Urgency level (ordinal: LOW=1, MEDIUM=2, HIGH=3, CRITICAL=4)
   - Units required
   - Days until deadline

3. **Interaction Features:**
   - Blood type exact match (binary)
   - Distance/proximity score
   - Time pressure factor (deadline urgency)

---

## How to Integrate

Once your ML service is ready, update the matching API at:

**File:** `app/api/blood-requests/[id]/match/route.ts`

Add ML service call after rule-based filtering:

```typescript
// After getting eligibleDonors from rule-based filtering
const mlServiceUrl = process.env.ML_SERVICE_URL;

if (mlServiceUrl) {
  const mlResponse = await fetch(`${mlServiceUrl}/api/v1/match/rank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bloodRequest,
      eligibleDonors,
      maxResults: 20
    })
  });
  
  if (mlResponse.ok) {
    const mlData = await mlResponse.json();
    // Use mlData.data.rankedDonors for ordering
    // Store matchScore in DonorMatch record
  }
}
```

---

## Environment Variables Needed

Add to your `.env.local`:

```env
ML_SERVICE_URL=http://localhost:8000
ML_SERVICE_API_KEY=your_api_key_here  # Optional, for authentication
ML_SERVICE_TIMEOUT=5000  # Timeout in ms
```
