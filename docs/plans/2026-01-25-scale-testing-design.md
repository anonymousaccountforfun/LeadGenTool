# Scale Testing Design for Email Identification

**Goal:** Validate 85%+ email identification at scale across volume and industry diversity.

## Test Suite Overview

| Test | Focus | Volume | Success Criteria |
|------|-------|--------|------------------|
| 1 | Fashion/Clothing Deep Dive | 100 | 90%+ emails (core market) |
| 2 | Industry Diversity Stress Test | 150 | 85%+ average, identify weak industries |
| 3 | Volume Scaling Test | 250 | No degradation at scale |
| 4 | Website vs No-Website Analysis | 100 | Quantify discovery gap |
| 5 | Email Quality Audit | 50 | Confidence scores predict deliverability |

**Total: 650 businesses tested**

---

## Test 1: Fashion/Clothing Deep Dive

**Purpose:** Validate performance in core market (CPG/fashion).

**Parameters:**
- 10 fashion-related searches × 10 businesses each = 100 total
- Mix of fashion hubs (NYC, LA, Miami) and regular markets

**Queries:**
1. "boutique clothing store"
2. "women's fashion boutique"
3. "men's clothing store"
4. "vintage clothing shop"
5. "streetwear store"
6. "designer consignment"
7. "bridal shop"
8. "children's clothing boutique"
9. "sustainable fashion store"
10. "sneaker store"

**Target:** 90%+ email find rate

---

## Test 2: Industry Diversity Stress Test

**Purpose:** Find weak spots across verticals.

**Parameters:**
- 15 industry categories × 10 businesses each = 150 total
- Single market (Houston, TX) to control for geography

**Categories:**
1. Fashion/CPG - "clothing boutique"
2. Beauty - "hair salon"
3. Fitness - "gym fitness center"
4. Restaurant - "restaurant"
5. Healthcare - "dentist"
6. Legal - "law firm"
7. Accounting - "CPA accountant"
8. Real Estate - "real estate agent"
9. Home Services - "plumber"
10. Auto - "auto repair shop"
11. Pet Services - "veterinarian"
12. Photography - "wedding photographer"
13. Florist - "florist"
14. Jewelry - "jewelry store"
15. Furniture - "furniture store"

**Target:** 85%+ average, identify bottom 3 industries

---

## Test 3: Volume Scaling Test

**Purpose:** Stress-test with large requests.

**Parameters:**
- Single search: 250 businesses
- Query: "restaurant" in "Los Angeles, CA"
- Measure at intervals: 25, 50, 100, 150, 200, 250

**Metrics:**
- Email find rate at each checkpoint
- Time per business
- Error rates
- Memory/resource usage

**Target:** No performance degradation at scale

---

## Test 4: Website vs No-Website Analysis

**Purpose:** Quantify the website discovery gap.

**Parameters:**
- 100 businesses from mixed industry search
- Query: "small business" in "Austin, TX"
- Segment by initial website presence

**Analysis:**
- Businesses WITH websites → email find rate
- Businesses WITHOUT websites → website discovery rate → email find rate
- Identify improvement opportunities

**Target:**
- With website: 95%+
- Discovered website: 85%+
- No website found: 30%+

---

## Test 5: Email Quality Audit

**Purpose:** Verify found emails are deliverable.

**Parameters:**
- Sample 50 emails from Tests 1-4
- Stratified by confidence level and source

**Sample Distribution:**
- Website scrape (80%+ confidence): 15
- Website scrape (60-80% confidence): 10
- Pattern + SMTP verified: 10
- Pattern + MX only: 10
- Discovered website: 5

**Validation:**
- MX record verification
- SMTP handshake
- Confidence score accuracy

**Target:** Confidence scores accurately predict deliverability

---

## Running the Tests

```bash
# Run full suite
npx tsx scripts/scale-tests/run-all.ts

# Run individual tests
npx tsx scripts/scale-tests/test-1-fashion.ts
npx tsx scripts/scale-tests/test-2-industry.ts
npx tsx scripts/scale-tests/test-3-volume.ts
npx tsx scripts/scale-tests/test-4-website-gap.ts
npx tsx scripts/scale-tests/test-5-quality.ts
```

## Expected Outcomes

1. **Core market validation** - Confidence fashion/CPG hits 90%+
2. **Weak industry identification** - Know where to focus improvements
3. **Scale confidence** - System handles 250+ businesses reliably
4. **Gap quantification** - Exact numbers on website discovery opportunity
5. **Quality assurance** - Confidence scores are meaningful
