const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");

console.log("=== SERVER STARTUP ===");
console.log("Current directory:", __dirname);
console.log("Database path:", path.join(__dirname, "database.sqlite"));

// Database wrapper class
class Database {
  constructor(dbPath) {
    console.log("Initializing database at:", dbPath);
    this.db = new sqlite3.Database(dbPath);
  }

  // CRUD operations
  async create(table, data) {
    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data)
      .map(() => "?")
      .join(", ");
    const values = Object.values(data);

    return new Promise((resolve, reject) => {
      const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
      this.db.run(query, values, function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  async read(table, conditions = {}, columns = "*", join = "") {
    let whereClause = "";
    const values = [];

    if (Object.keys(conditions).length > 0) {
      const conditionsArray = [];

      for (const [key, value] of Object.entries(conditions)) {
        if (value) {
          if (key === "price") {
            // Handle price ranges
            const [min, max] = value.split("-");
            if (max) {
              conditionsArray.push(`price BETWEEN ? AND ?`);
              values.push(parseFloat(min), parseFloat(max));
            } else if (min === "10000+") {
              conditionsArray.push(`price >= ?`);
              values.push(10000);
            }
          } else if (key === "size") {
            // Handle size ranges
            const sizeRanges = {
              small: "width <= 60 AND height <= 40",
              medium: "width <= 100 AND height <= 70",
              large: "width <= 150 AND height <= 100",
            };
            if (sizeRanges[value]) {
              conditionsArray.push(sizeRanges[value]);
            }
          } else {
            conditionsArray.push(`${key} = ?`);
            values.push(value);
          }
        }
      }

      if (conditionsArray.length > 0) {
        whereClause = "WHERE " + conditionsArray.join(" AND ");
      }
    }

    return new Promise((resolve, reject) => {
      const query = `SELECT ${columns} FROM ${table} ${join} ${whereClause}`;
      this.db.all(query, values, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async update(table, data, conditions) {
    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = [...Object.values(data), ...Object.values(conditions)];

    return new Promise((resolve, reject) => {
      const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
      this.db.run(query, values, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async delete(table, conditions) {
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);

    return new Promise((resolve, reject) => {
      const query = `DELETE FROM ${table} WHERE ${whereClause}`;
      this.db.run(query, values, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

// Create Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, "src")));
app.use("/static", express.static(path.join(__dirname, "src/static")));
app.use("/js", express.static(path.join(__dirname, "src/js")));

// Set view engine
app.set("view engine", "html");
app.engine("html", (filePath, options, callback) => {
  fs.readFile(filePath, (err, content) => {
    if (err) return callback(err);
    let rendered = content.toString();
    for (const [key, value] of Object.entries(options)) {
      rendered = rendered.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return callback(null, rendered);
  });
});

// Initialize database
const db = new Database("database.sqlite");

// Middleware для проверки авторизации
app.use(async (req, res, next) => {
  if (req.cookies.userId) {
    try {
      const users = await db.read("users", { id_u: req.cookies.userId });
      if (users.length > 0) {
        req.user = users[0];
        res.locals.user = users[0];
      }
    } catch (err) {
      res.status(500).send("Internal Server Error");
    }
  }
  next();
});

// Routes for HTML files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.get("/partials/header.html", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "partials", "header.html"));
});

app.get("/catalog", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "catalog.html"));
});

app.get("/auth", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "auth.html"));
});

app.get("/profile", (req, res) => {
  const userId = req.cookies.userId;
  if (!userId) {
    return res.redirect("/auth");
  }
  res.sendFile(path.join(__dirname, "src", "profile.html"));
});

// Review route
app.post("/api/review", async (req, res) => {
  try {
    const { comment, id_p, id_u } = req.body;
    const userId = id_u || req.cookies.userId;

    if (!userId) {
      return res
        .status(401)
        .send('<div class="error">Необходимо авторизоваться</div>');
    }

    if (!comment || !id_p) {
      return res
        .status(400)
        .send(
          '<div class="error">Текст отзыва и выбор картины обязательны</div>'
        );
    }

    const userCheck = await db.read("users", { id_u: parseInt(userId) });
    if (!userCheck || userCheck.length === 0) {
      return res
        .status(401)
        .send('<div class="error">Пользователь не найден</div>');
    }

    const paintingCheck = await db.read("painting", { id_p: parseInt(id_p) });
    if (!paintingCheck || paintingCheck.length === 0) {
      return res
        .status(400)
        .send('<div class="error">Картина не найдена</div>');
    }

    const query = `INSERT INTO review (id_u, id_p, comment, review_date) VALUES (?, ?, ?, ?)`;
    const values = [
      parseInt(userId),
      parseInt(id_p),
      comment,
      new Date().toISOString(),
    ];

    db.db.run(query, values, function (err) {
      if (err) {
        res
          .status(500)
          .send('<div class="error">Ошибка при добавлении отзыва</div>');
      } else {
        res.redirect("/?review=success");
      }
    });
  } catch (err) {
    res
      .status(500)
      .send('<div class="error">Ошибка при добавлении отзыва</div>');
  }
});

// Example routes
app.post("/api/:table", async (req, res) => {
  try {
    const id = await db.create(req.params.table, req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/:table", async (req, res) => {
  try {
    const { id, ...data } = req.body;
    const changes = await db.update(req.params.table, data, { id });
    res.json({ changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/:table", async (req, res) => {
  try {
    const changes = await db.delete(req.params.table, req.query);
    res.json({ changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Painting routes
app.get("/api/painting", async (req, res) => {
  try {
    const paintings = await db.read("painting", req.query);

    if (req.headers["hx-target"] === "painting-select") {
      let html = '<option value="">Выберите картину</option>';
      for (const painting of paintings) {
        html += `<option value="${painting.id_p}">${painting.title} - ${painting.author} (${painting.price}₽)</option>`;
      }
      res.set("Content-Type", "text/html");
      return res.send(html);
    }

    const templatePath = path.join(
      __dirname,
      "src",
      "partials",
      "painting-card.html"
    );
    const template = fs.readFileSync(templatePath, "utf8");

    let html = "";
    for (const painting of paintings) {
      let cardHtml = template;
      for (const [key, value] of Object.entries(painting)) {
        cardHtml = cardHtml.replace(new RegExp(`{{${key}}}`, "g"), value || "");
      }
      html += cardHtml;
    }

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    res.status(500).send("Error rendering template");
  }
});

// Review route
app.get("/api/review", async (req, res) => {
  try {
    const review = await db.read(
      "review",
      req.query,
      "review.*, users.first_name, users.last_name, painting.title",
      "LEFT JOIN users ON review.id_u = users.id_u LEFT JOIN painting ON review.id_p = painting.id_p ORDER BY review.review_date DESC"
    );

    const templatePath = path.join(
      __dirname,
      "src",
      "partials",
      "review-card.html"
    );
    const template = fs.readFileSync(templatePath, "utf8");

    let html = "";
    for (const r of review) {
      let cardHtml = template;
      for (const [key, value] of Object.entries(r)) {
        cardHtml = cardHtml.replace(new RegExp(`{{${key}}}`, "g"), value || "");
      }
      html += cardHtml;
    }

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    res.status(500).send("Error rendering template");
  }
});

// Auth routes
app.post("/api/auth/register", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    const existingUser = await db.read("users", { email });
    if (existingUser.length > 0) {
      return res
        .status(400)
        .send(
          '<div class="error">Пользователь с таким email уже существует</div>'
        );
    }

    const userId = await db.create("users", {
      first_name,
      last_name,
      email,
      password,
    });

    res.send(
      '<div class="success">Регистрация успешна! Теперь вы можете войти.</div>'
    );
  } catch (err) {
    res.status(500).send('<div class="error">Ошибка при регистрации</div>');
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.read("users", { email });

    if (!user || user.length === 0) {
      return res.status(401).send("Неверный email или пароль");
    }

    const hashedPassword = user[0].password;
    const match = await bcrypt.compare(password, hashedPassword);

    if (!match) {
      return res.status(401).send("Неверный email или пароль");
    }

    const userId = user[0].id_u;

    res.cookie("userId", userId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    res.json({ success: true, user: { id: userId, email: user[0].email } });
  } catch (err) {
    res.status(500).send("Ошибка при входе");
  }
});

// Auth check endpoint
app.get("/api/auth/check", (req, res) => {
  const isAuthenticated = !!req.cookies.userId;
  res.json({ authenticated: isAuthenticated });
});

// Cart routes
app.post("/api/cart/add", async (req, res) => {
  console.log("=== CART ADD REQUEST ===");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("Cookies:", req.cookies);

  try {
    const { paintingId } = req.body;
    const userId = req.cookies.userId;

    console.log("Painting ID:", paintingId);
    console.log("User ID:", userId);

    if (!userId) {
      console.log("No user ID in cookies");
      return res.status(401).json({ error: "Необходимо авторизоваться" });
    }

    // Проверяем существование картины
    const painting = await db.read("painting", { id_p: paintingId });
    console.log("Found painting:", painting);

    if (!painting || painting.length === 0) {
      console.log("Painting not found");
      return res.status(404).json({ error: "Картина не найдена" });
    }

    // Генерируем уникальный id_sc
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const id_sc = `${timestamp}-${random}`;

    // Добавляем в корзину
    await db.create("shopping_cart", {
      id_p: paintingId,
      id_u: userId,
      id_sc: id_sc,
      dateadd: new Date().toISOString(),
    });

    console.log("Successfully added to cart");
    res.json({ success: true });
  } catch (err) {
    console.error("Error adding to cart:", err);
    res.status(500).json({ error: "Ошибка при добавлении в корзину" });
  }
  console.log("=== END CART ADD REQUEST ===");
});

app.get("/api/cart", async (req, res) => {
  console.log("=== CART GET REQUEST ===");
  console.log("Headers:", req.headers);
  console.log("Cookies:", req.cookies);

  try {
    const userId = req.cookies.userId;
    console.log("User ID:", userId);

    if (!userId) {
      console.log("No user ID in cookies");
      return res.status(401).json({ error: "Необходимо авторизоваться" });
    }

    const cart = await db.read(
      "shopping_cart",
      { id_u: userId },
      "shopping_cart.*, painting.title, painting.price, painting.image",
      "LEFT JOIN painting ON shopping_cart.id_p = painting.id_p"
    );
    console.log("Found cart items:", cart);

    res.json(cart);
  } catch (err) {
    console.error("Error getting cart:", err);
    res.status(500).json({ error: "Ошибка при получении корзины" });
  }
  console.log("=== END CART GET REQUEST ===");
});

app.delete("/api/cart/:id_sc", async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).json({ error: "Необходимо авторизоваться" });
    }

    await db.delete("shopping_cart", { id_sc: req.params.id_sc, id_u: userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Ошибка при удалении из корзины" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function onRegisterSuccess(event) {
  if (
    event.detail.xhr &&
    event.detail.xhr.responseText.includes("Регистрация успешна")
  ) {
    toggleForms();
    document.getElementById("register-first-name").value = "";
    document.getElementById("register-last-name").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";
    document.getElementById("register-phone").value = "";
    document.getElementById("auth-message").className = "success";
  }
}
