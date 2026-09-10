const express = require('express');
const router = express.Router();
const { adminMiddleware, requireRole } = require('../middleware/admin_auth.middleware');
const { query } = require('../database/db');
const logger = require('../utils/logger');
const crypto = require('crypto');

router.use(adminMiddleware);

const toPaise = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`${field} must be a non-negative number`), { statusCode: 400 });
  return Math.round(n * 100);
};

router.get('/', async (req, res, next) => {
  try { res.json({ status: 'success', data: (await query('SELECT * FROM promotions ORDER BY created_at DESC')).rows }); }
  catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { title, subtitle, tag, buttonText, imageUrl, targetScreen, description, type, bonusAmount, minDeposit, validFrom, validUntil } = req.body || {};
    const adminId = req.admin?.id || 'admin_sys';
    if (!title || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 100) {
      return res.status(400).json({ status: 'error', message: 'title is required and must be between 2 and 100 characters' });
    }
    const cleanType = String(type || '').trim().toUpperCase();
    const allowedTypes = ['DEPOSIT', 'CASHBACK', 'SPECIAL', 'FESTIVAL', 'VIP', 'BANNER', 'GENERAL'];
    if (!allowedTypes.includes(cleanType)) {
      return res.status(400).json({ status: 'error', message: `type must be one of: ${allowedTypes.join(', ')}` });
    }
    if (validFrom && validUntil) {
      const fromTime = new Date(validFrom).getTime();
      const untilTime = new Date(validUntil).getTime();
      if (Number.isNaN(fromTime) || Number.isNaN(untilTime) || fromTime > untilTime) {
        return res.status(400).json({ status: 'error', message: 'validFrom must be earlier than or equal to validUntil' });
      }
    }
    const bonusPaise = toPaise(bonusAmount, 'bonusAmount') ?? 0;
    const minDepositPaise = toPaise(minDeposit, 'minDeposit') ?? 0;
    const id = `promo_${crypto.randomUUID().slice(0, 8)}`;
    const result = await query(`INSERT INTO promotions (id,title,subtitle,tag,button_text,image_url,target_screen,description,type,bonus_amount,min_deposit,valid_from,valid_until,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING *`,
      [id,title.trim(),subtitle || 'DEPOSIT -> GET BONUS',tag || 'DEPOSIT',buttonText || 'DEPOSIT NOW',imageUrl || '/banners/deposit_banner.png',targetScreen || '/add-cash',description || null,cleanType,bonusPaise,minDepositPaise,validFrom || null,validUntil || null,adminId]);
    await query(`INSERT INTO audit_logs (id,user_id,action,details,created_at) VALUES ($1,$2,'PROMOTION_CREATE',$3::jsonb,NOW())`, [`al_${crypto.randomUUID()}`,adminId,JSON.stringify({promoId:id,title:title.trim()})]);
    res.status(201).json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subtitle, tag, buttonText, imageUrl, targetScreen, description, bonusAmount, minDeposit, validFrom, validUntil } = req.body || {};
    const adminId = req.admin?.id || 'admin_sys';
    const bonusPaise = toPaise(bonusAmount, 'bonusAmount');
    const minDepositPaise = toPaise(minDeposit, 'minDeposit');
    const result = await query(`UPDATE promotions SET title=COALESCE($2,title),subtitle=COALESCE($3,subtitle),tag=COALESCE($4,tag),button_text=COALESCE($5,button_text),image_url=COALESCE($6,image_url),target_screen=COALESCE($7,target_screen),description=COALESCE($8,description),bonus_amount=COALESCE($9,bonus_amount),min_deposit=COALESCE($10,min_deposit),valid_from=COALESCE($11,valid_from),valid_until=COALESCE($12,valid_until),updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id,title ?? null,subtitle ?? null,tag ?? null,buttonText ?? null,imageUrl ?? null,targetScreen ?? null,description ?? null,bonusPaise,minDepositPaise,validFrom ?? null,validUntil ?? null]);
    if (!result.rows.length) return res.status(404).json({ status: 'error', message: 'Promotion not found' });
    await query(`INSERT INTO audit_logs (id,user_id,action,details,created_at) VALUES ($1,$2,'PROMOTION_UPDATE',$3::jsonb,NOW())`, [`al_${crypto.randomUUID()}`,adminId,JSON.stringify({promoId:id})]);
    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) { next(err); }
});

router.post('/:id/toggle', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params; const adminId = req.admin?.id || 'admin_sys';
    const cur = await query('SELECT status FROM promotions WHERE id=$1', [id]);
    if (!cur.rows.length) return res.status(404).json({ status:'error', message:'Promotion not found' });
    const newStatus = cur.rows[0].status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const result = await query('UPDATE promotions SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[newStatus,id]);
    await query(`INSERT INTO audit_logs (id,user_id,action,details,created_at) VALUES ($1,$2,'PROMOTION_TOGGLE',$3::jsonb,NOW())`, [`al_${crypto.randomUUID()}`,adminId,JSON.stringify({promoId:id,newStatus})]);
    res.json({status:'success',data:result.rows[0]});
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'FINANCE_ADMIN', 'GAME_ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params; const adminId = req.admin?.id || 'admin_sys';
    const result = await query('DELETE FROM promotions WHERE id=$1 RETURNING id',[id]);
    if (!result.rows.length) return res.status(404).json({status:'error',message:'Promotion not found'});
    await query(`INSERT INTO audit_logs (id,user_id,action,details,created_at) VALUES ($1,$2,'PROMOTION_DELETE',$3::jsonb,NOW())`, [`al_${crypto.randomUUID()}`,adminId,JSON.stringify({promoId:id})]);
    res.json({status:'success',message:'Promotion deleted'});
  } catch (err) { next(err); }
});

module.exports = router;
