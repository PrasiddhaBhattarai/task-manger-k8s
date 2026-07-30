const express = require('express');
const router = express.Router();

/**
 * Validate that :id is a positive integer.
 * Returns parsed integer or sends 400 response.
 */
function parseId(req, res) {
  const raw = req.params.id;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid ID', fields: ['id'] });
    return null;
  }
  return id;
}

/**
 * Get the database pool from app.locals (injected by createApp).
 */
function getPool(req) {
  return req.app.locals.pool;
}

/**
 * Wraps an async route handler to catch DB errors and return 503.
 */
function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      console.error('Database error:', err);
      // pg connection errors or query errors when DB is unavailable
      res.status(503).json({ error: 'Database unavailable' });
    }
  };
}

// GET / — list all tasks
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pool = getPool(req);
    const result = await pool.query('SELECT * FROM tasks ORDER BY id ASC');
    res.status(200).json(result.rows);
  })
);

// GET /:id — get single task
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const pool = getPool(req);
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json(result.rows[0]);
  })
);

// POST / — create task
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const errors = [];
    const { title, description, completed } = req.body;

    // Validate title: required, string, 1-255 chars
    if (title === undefined || title === null) {
      errors.push('title');
    } else if (typeof title !== 'string') {
      errors.push('title');
    } else if (title.length < 1 || title.length > 255) {
      errors.push('title');
    }

    // Validate description: optional, but must be string if provided
    if (description !== undefined && description !== null && typeof description !== 'string') {
      errors.push('description');
    }

    // Validate completed: optional, but must be boolean if provided
    if (completed !== undefined && completed !== null && typeof completed !== 'boolean') {
      errors.push('completed');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    const pool = getPool(req);
    const result = await pool.query(
      'INSERT INTO tasks (title, description, completed) VALUES ($1, $2, $3) RETURNING *',
      [title, description || '', completed !== undefined && completed !== null ? completed : false]
    );
    res.status(201).json(result.rows[0]);
  })
);

// PUT /:id — update task
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const errors = [];
    const { title, description, completed } = req.body;

    // At least one valid field must be provided
    const hasTitle = title !== undefined;
    const hasDescription = description !== undefined;
    const hasCompleted = completed !== undefined;

    if (!hasTitle && !hasDescription && !hasCompleted) {
      return res.status(400).json({ error: 'Validation failed', fields: ['title', 'description', 'completed'] });
    }

    // Validate title if provided: string, 1-255 chars
    if (hasTitle) {
      if (title === null || typeof title !== 'string') {
        errors.push('title');
      } else if (title.length < 1 || title.length > 255) {
        errors.push('title');
      }
    }

    // Validate description if provided: must be string
    if (hasDescription && description !== null && typeof description !== 'string') {
      errors.push('description');
    }

    // Validate completed if provided: must be boolean
    if (hasCompleted && completed !== null && typeof completed !== 'boolean') {
      errors.push('completed');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', fields: errors });
    }

    // Build dynamic UPDATE query
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    if (hasTitle) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (hasDescription) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(description !== null ? description : '');
    }
    if (hasCompleted) {
      setClauses.push(`completed = $${paramIndex++}`);
      values.push(completed !== null ? completed : false);
    }

    values.push(id);
    const query = `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

    const pool = getPool(req);
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json(result.rows[0]);
  })
);

// DELETE /:id — delete task
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;

    const pool = getPool(req);
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(204).send();
  })
);

module.exports = router;
