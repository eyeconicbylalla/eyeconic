const mongoose = require('mongoose');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

const isValidEmail = (value) =>
  typeof value === 'string' && value.trim().length <= 254 && EMAIL_PATTERN.test(value.trim());

// Accepts local digits or E.164 with spaces/dashes/parentheses.
const isValidPhone = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.replace(/[\s\-()]/g, '');
  return normalized.length <= 16 && PHONE_PATTERN.test(normalized);
};

const normalizePhone = (value) => String(value || '').replace(/[\s\-()]/g, '');

// bcrypt operates on at most 72 bytes of input.
const isValidPassword = (value) => typeof value === 'string' && value.length >= 6 && value.length <= 72;

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(String(value));

// Escapes user input before it is used as a RegExp/$regex so crafted
// patterns cannot trigger regex denial-of-service against MongoDB.
const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  escapeRegex,
  isValidEmail,
  isValidObjectId,
  isValidPassword,
  isValidPhone,
  normalizePhone,
};
