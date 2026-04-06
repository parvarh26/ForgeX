import httpx
import time

API_URL = "http://localhost:8000/api/v1/issues/"

# Synthetic dataset that naturally forms clusters 
ISSUES = [
    # Cluster 1: Payment/Timeout
    {"title": "Checkout page times out after 10 seconds", "body": "When hitting the submit payment button, the gateway returns 504 and times out repeatedly."},
    {"title": "Payment gateway 504", "body": "Users are reporting a 504 gateway timeout exactly during the payment step."},
    {"title": "Card processing failure timeout", "body": "Process hangs and crashes gateway during checkout with timeout."},
    
    # Cluster 2: UI Contrast
    {"title": "Contrast issue on mobile dark mode", "body": "The settings text is completely unreadable on iOS devices when dark mode toggled."},
    {"title": "Cannot read text in settings", "body": "Dark mode font color is blending in with the background on the mobile app."},
    {"title": "Accessibility violation in dark view", "body": "Settings contrast ratio is below 3:1 on mobile, hard to see text."},
]

def run_simulation():
    print("🚀 Firing OpenIssue Intelligence Simulation...")
    # Use httpx sync client which is already in requirements
    with httpx.Client() as client:
        for issue in ISSUES:
            try:
                print(f"Adding Issue: {issue['title']}")
                res = client.post(API_URL, json=issue, timeout=20.0)
                if res.status_code == 200:
                    data = res.json()
                    print(f"   ↳ Priority: {data['priority_score']} | Duplicates: {data['duplicate_count']}")
                else:
                    print(f"Error: {res.text}")
            except Exception as e:
                print(f"Connection failed: {e}")
            time.sleep(2)  # Simulate real-time streaming webhook delays
            
    print("✅ Streaming Complete. Check your React Dashboard!")

if __name__ == "__main__":
    run_simulation()
