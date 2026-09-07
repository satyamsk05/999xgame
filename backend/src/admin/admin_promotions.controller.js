const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const crypto = require('crypto');

router.use(adminMiddleware);

/** GET /api/admin/promotions */
router.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM promotions ORDER BY created_at DESC');
    res.json({ status: 'success', data: result.rows });
  } catch (err) { next(err); }
});

/** POST /api/admin/promotions — Create */
router.post('/', async (req, res, next) => {
  try {
    const { title, description, type, bonusAmount, minDeposit, validFrom, validUntil } = req.body;
    const adminId = req.admin?.id || 'admin_sys';

    if (!title || !type) return res.status(400).json({ status: 'error', message: 'title and type are required' });

    const id = `promo_${crypto.randomUUID().slice(0, 8)}`;
    const result = await query(
      `INSERT INTO promotions (id, title, description, type, bonus_amount, min_deposit, valid_from, valid_until, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *`,
      [id, title, description || null, type,
       bonusAmount ? Math.round(bonusAmount * 100) : 0,
       minDeposit  ? Math.round(minDeposit  * 100) : 0,
       validFrom || null, validUntil || null, adminId]
    );

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1,$2,'PROMOTION_CREATE',$3::jsonb,NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ promoId: id, title })]
    );

    logger.info('Admin created promotion', { adminId, id, title });
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/promotions/:id — Edit */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, bonusAmount, minDeposit, validFrom, validUntil } = req.body;

    const result = await query(
      `UPDATE promotions
       SET title        = COALESCE($2, title),
           description  = COALESCE($3, description),
           bonus_amount = COALESCE($4, bonus_amount),
           min_deposit  = COALESCE($5, min_deposit),
           valid_from   = COALESCE($6, valid_from),
           valid_until  = COALESCE($7, valid_until),
           updated_at   = NOW()
       WHERE id = $1 RETURNING *`,
      [id, title || null, description || null,
       bonusAmount ? Math.round(bonusAmount * 100) : null,
       minDeposit  ? Math.round(minDeposit  * 100) : null,
       validFrom || null, validUntil || null]
    );
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'Promotion not found' });
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

/** POST /api/admin/promotions/:id/toggle — Enable / Disable */
router.post('/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id || 'admin_sys';

    const cur = await query('SELECT status FROM promotions WHERE id = $1', [id]);
    if (!cur.rows.length) return res.status(404).json({ status: 'error', message: 'Promotion not found' });

    const newStatus = cur.rows[0].status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const result = await query('UPDATE promotions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [newStatus, id]);

    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1,$2,'PROMOTION_TOGGLE',$3::jsonb,NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ promoId: id, newStatus })]
    );

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/promotions/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.admin?.id || 'admin_sys';
    await query('DELETE FROM promotions WHERE id = $1', [id]);
    await query(
      `INSERT INTO audit_logs (id, user_id, action, details, created_at)
       VALUES ($1,$2,'PROMOTION_DELETE',$3::jsonb,NOW())`,
      [`al_${Date.now()}`, adminId, JSON.stringify({ promoId: id })]
    );
    res.json({ status: 'success', message: 'Promotion deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
