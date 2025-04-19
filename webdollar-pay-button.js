// Updated methods for webdollar-pay-button.js

async createPaymentRequest() {
    try {
        // Generate a unique reference ID if not provided
        if (!this.options.paymentId) {
            this.options.paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        const response = await fetch('/api/payments/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount: this.options.amount,
                recipient: this.options.recipient,
                reference: this.options.paymentId
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to create payment request');
        }

        const data = await response.json();
        
        // Store the payment ID for verification
        this.options.paymentId = data.paymentId;
        
        return data;
    } catch (error) {
        console.error('Payment request error:', error);
        throw new Error(`Could not create payment: ${error.message}`);
    }
}

async verifyPayment(txHash) {
    if (!this.options.paymentId) {
        throw new Error('Payment ID is missing');
    }

    try {
        // First notify backend about the transaction
        await this.notifyBackendAboutTransaction(txHash);
        
        // Then verify payment status with retry logic
        return await this.checkPaymentStatusWithRetry();
    } catch (error) {
        console.error('Payment verification error:', error);
        throw new Error(`Payment verification failed: ${error.message}`);
    }
}

async notifyBackendAboutTransaction(txHash) {
    const response = await fetch('/api/payments/webhook', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            txHash,
            recipient: this.options.recipient,
            amount: this.options.amount,
            reference: this.options.paymentId
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to notify backend about transaction');
    }
}

async checkPaymentStatusWithRetry(maxAttempts = 10, delay = 3000) {
    let attempts = 0;
    let lastError = null;

    while (attempts < maxAttempts) {
        attempts++;
        
        try {
            const response = await fetch(`/api/payments/status/${this.options.paymentId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.status === 'confirmed') {
                return {
                    success: true,
                    paymentId: this.options.paymentId,
                    txHash: data.txHash,
                    amount: data.amount,
                    recipient: data.recipient,
                    confirmedAt: data.confirmedAt
                };
            } else if (data.status === 'failed') {
                throw new Error('Payment was rejected by the backend');
            }
            
            // If not confirmed yet, wait and try again
            await new Promise(resolve => setTimeout(resolve, delay));
        } catch (error) {
            lastError = error;
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * attempts));
        }
    }

    throw lastError || new Error('Payment verification timed out');
}

// Add these methods to your WebDollarPayButton class
