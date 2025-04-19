// server.js
const express = require('express');
const bodyParser = require('body-parser');
const WebDollar = require('@webdollar/node-client'); // You'll need to install this
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize WebDollar client
const webDollarClient = new WebDollar.NodeClient({
    host: '127.0.0.1', // or your WebDollar node host
    port: 8080, // default WebDollar node port
    protocol: 'http'
});

// Mock database (replace with real DB in production)
const paymentsDB = new Map();

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // Serve frontend files

// API Endpoints
app.post('/api/payments/create', async (req, res) => {
    try {
        const { amount, recipient, reference } = req.body;
        
        // Validate inputs
        if (!amount || !recipient) {
            return res.status(400).json({ error: 'Amount and recipient are required' });
        }

        // Generate unique payment ID
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store payment
        paymentsDB.set(paymentId, {
            paymentId,
            amount,
            recipient,
            reference,
            status: 'pending',
            createdAt: new Date(),
            txHash: null
        });

        res.json({
            success: true,
            paymentId,
            amount,
            recipient,
            reference,
            status: 'pending'
        });
    } catch (error) {
        console.error('Payment creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/payments/status/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        if (!paymentsDB.has(paymentId)) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        const payment = paymentsDB.get(paymentId);
        
        // If already confirmed, return status
        if (payment.status === 'confirmed') {
            return res.json(payment);
        }
        
        // Check if we have a transaction hash
        if (payment.txHash) {
            // Verify transaction on blockchain
            const tx = await webDollarClient.getTransaction(payment.txHash);
            
            if (tx && tx.confirmed) {
                payment.status = 'confirmed';
                payment.confirmedAt = new Date();
                paymentsDB.set(paymentId, payment);
            }
        }
        
        res.json(payment);
    } catch (error) {
        console.error('Payment status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/payments/webhook', async (req, res) => {
    try {
        // This would be called by your WebDollar node when transactions occur
        const { txHash, recipient, amount, reference } = req.body;
        
        // Find payment by reference (which should be paymentId)
        let payment;
        for (const [key, value] of paymentsDB.entries()) {
            if (value.reference === reference) {
                payment = value;
                break;
            }
        }
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        // Update payment with transaction hash
        payment.txHash = txHash;
        paymentsDB.set(payment.paymentId, payment);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Serve the embeddable button files
app.get('/embed.js', (req, res) => {
    res.sendFile(__dirname + '/public/embed.js');
});

app.get('/webdollar-pay-button.js', (req, res) => {
    res.sendFile(__dirname + '/public/webdollar-pay-button.js');
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    try {
        await webDollarClient.connect();
        console.log('Connected to WebDollar node');
    } catch (error) {
        console.error('Failed to connect to WebDollar node:', error);
    }
});