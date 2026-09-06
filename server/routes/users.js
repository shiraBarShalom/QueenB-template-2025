const express = require("express");
const router = express.Router();

const userService = require("../services/userService");
const { sendSuccess } = require("../utils/responseHandler");
const { handleError } = require("../utils/prismaError");

// Business-oriented user surface. NOT a generic ORM passthrough:
// only the actions the frontend needs (create user, list, view, edit profile).

// POST /api/users — create a user (accepts `password`, stores only a scrypt hash)
router.post("/", async (req, res) => {
  try {
    const user = await userService.createUser(req.body);
    return sendSuccess(res, user, "User created", 201);
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/users — list users (passwordHash never included)
router.get("/", async (req, res) => {
  try {
    const users = await userService.listUsers();
    return sendSuccess(res, users, "Users fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// GET /api/users/:id — single user
router.get("/:id", async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    return sendSuccess(res, user, "User fetched");
  } catch (err) {
    return handleError(err, res);
  }
});

// PATCH /api/users/:id — partial update of profile fields
router.patch("/:id", async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    return sendSuccess(res, user, "User updated");
  } catch (err) {
    return handleError(err, res);
  }
});

module.exports = router;
