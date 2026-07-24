-- One-off historical data correction — MIMONY-RETURNS-ORDERSTATUS-001
-- Order ORD-20260715-7AF2FE was mislabeled orderStatus="refunded" by a since-fixed bug
-- (the pre-8b108fa "quick refund" dialog marked orders refunded on return SUBMISSION,
-- not completion). Both of its returns (RET-20260715-057108, RET-20260715-74A926) are
-- status="rejected" — no return against this order ever completed, so orderStatus should
-- never have left its pre-return value. paymentStatus="paid" on the same row is correct
-- and untouched.
--
-- This is NOT a reusable endpoint or a general-purpose fix — it targets this single row
-- by order_number, and the WHERE clause only matches if the row is still in the exact
-- corrupted state described in the ticket, so it is a safe no-op if already fixed or if
-- the row doesn't match what's expected.

UPDATE orders
SET order_status = 'completed',
    updated_at = NOW()
WHERE order_number = 'ORD-20260715-7AF2FE'
  AND order_status = 'refunded'
  AND payment_status = 'paid';

-- Verify before/after:
-- SELECT id, order_number, order_status, payment_status, updated_at FROM orders WHERE order_number = 'ORD-20260715-7AF2FE';
