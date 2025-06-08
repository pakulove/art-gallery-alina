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
    console.log("=== DATABASE INITIALIZATION ===");
    console.log("Database path:", dbPath);
    this.db = new sqlite3.Database(dbPath);
    console.log("Database connection established");
  }

  // CRUD operations
  async create(table, data) {
    console.log("=== DATABASE CREATE ===");
    console.log("Table:", table);
    console.log("Data:", data);

    const columns = Object.keys(data).join(", ");
    const placeholders = Object.keys(data)
      .map(() => "?")
      .join(", ");
    const values = Object.values(data);

    return new Promise((resolve, reject) => {
      const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
      console.log("SQL Query:", query);
      console.log("Values:", values);

      this.db.run(query, values, function (err) {
        if (err) {
          console.error("Database error:", err);
          console.error("Error stack:", err.stack);
          reject(err);
        } else {
          console.log("Insert successful, lastID:", this.lastID);
          resolve(this.lastID);
        }
      });
    });
  }

  async read(table, conditions = {}, columns = "*", additionalSQL = "") {
    console.log("=== DATABASE READ ===");
    console.log("Table:", table);
    console.log("Conditions:", conditions);
    console.log("Columns:", columns);
    console.log("Additional SQL:", additionalSQL);

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
      // Разделяем additionalSQL на JOIN и остальное
      const joinMatch = additionalSQL.match(
        /(LEFT|INNER|RIGHT)?\s*JOIN.*?(?=WHERE|ORDER BY|$)/i
      );
      const joinClause = joinMatch ? joinMatch[0] : "";
      const restSQL = additionalSQL.replace(joinClause, "").trim();

      // Формируем запрос с правильным порядком частей и без лишних пробелов
      const queryParts = [
        `SELECT ${columns}`,
        `FROM ${table}`,
        joinClause,
        whereClause,
        restSQL,
      ].filter(Boolean); // Удаляем пустые строки

      const query = queryParts.join(" ").replace(/\s+/g, " ").trim();

      console.log("Final SQL Query:", query);
      console.log("Query values:", values);

      this.db.all(query, values, (err, rows) => {
        if (err) {
          console.error("Database error:", err);
          console.error("Error stack:", err.stack);
          console.error("Failed query:", query);
          console.error("Query values:", values);
          reject(err);
        } else {
          console.log("Query successful, rows:", rows);
          resolve(rows || []);
        }
      });
    });
  }

  async update(table, data, conditions) {
    console.log("=== DATABASE UPDATE ===");
    console.log("Table:", table);
    console.log("Data:", data);
    console.log("Conditions:", conditions);

    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = [...Object.values(data), ...Object.values(conditions)];

    return new Promise((resolve, reject) => {
      const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
      console.log("SQL Query:", query);
      console.log("Values:", values);

      this.db.run(query, values, function (err) {
        if (err) {
          console.error("Database error:", err);
          console.error("Error stack:", err.stack);
          reject(err);
        } else {
          console.log("Update successful, changes:", this.changes);
          resolve(this.changes);
        }
      });
    });
  }

  async delete(table, conditions) {
    console.log("=== DATABASE DELETE ===");
    console.log("Table:", table);
    console.log("Conditions:", conditions);

    const whereClause = Object.keys(conditions)
      .map((key) => `${key} = ?`)
      .join(" AND ");
    const values = Object.values(conditions);

    return new Promise((resolve, reject) => {
      const query = `DELETE FROM ${table} WHERE ${whereClause}`;
      console.log("SQL Query:", query);
      console.log("Values:", values);

      this.db.run(query, values, function (err) {
        if (err) {
          console.error("Database error:", err);
          console.error("Error stack:", err.stack);
          reject(err);
        } else {
          console.log("Delete successful, changes:", this.changes);
          resolve(this.changes);
        }
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

app.get("/cart", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "cart.html"));
});

app.get("/events", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "events.html"));
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

// Logout route
app.post("/api/logout", (req, res) => {
  console.log("=== LOGOUT REQUEST ===");
  console.log("Request headers:", req.headers);
  console.log("Request cookies:", req.cookies);
  console.log("Current userId cookie:", req.cookies.userId);

  try {
    // Очищаем куку
    res.clearCookie("userId", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0, // Устанавливаем срок жизни в 0, чтобы кука удалилась
    });

    console.log("Cookie cleared successfully");
    res.json({ success: true });
  } catch (error) {
    console.error("Error during logout:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Ошибка при выходе из системы" });
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
        html += `<option value="${painting.id_p}">${painting.title}</option>`;
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
    console.log("=== GET REVIEWS REQUEST ===");

    const query = `
      SELECT review.*, users.first_name, users.last_name, painting.title 
      FROM review 
      LEFT JOIN users ON review.id_u = users.id_u 
      LEFT JOIN painting ON review.id_p = painting.id_p 
      ORDER BY review.review_date DESC
    `;

    console.log("Reviews query:", query);

    const reviews = await new Promise((resolve, reject) => {
      db.db.all(query, [], (err, rows) => {
        if (err) {
          console.error("Error in reviews query:", err);
          console.error("Query was:", query);
          reject(err);
        } else {
          console.log("Found reviews:", JSON.stringify(rows, null, 2));
          resolve(rows || []);
        }
      });
    });

    const templatePath = path.join(
      __dirname,
      "src",
      "partials",
      "review-card.html"
    );
    const template = fs.readFileSync(templatePath, "utf8");

    let html = "";
    for (const r of reviews) {
      let cardHtml = template;
      for (const [key, value] of Object.entries(r)) {
        cardHtml = cardHtml.replace(new RegExp(`{{${key}}}`, "g"), value || "");
      }
      html += cardHtml;
    }

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("=== ERROR IN GET REVIEWS ===");
    console.error("Full error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).send("Error rendering template");
  }
});

// Auth routes
app.post("/api/auth/register", async (req, res) => {
  try {
    console.log("=== REGISTER REQUEST ===");
    console.log("Request body:", req.body);

    const { first_name, last_name, email, password, phone } = req.body;

    if (!first_name || !last_name || !email || !password) {
      console.log("Missing required fields");
      return res.status(400).send("Все поля обязательны для заполнения");
    }

    // Проверяем, существует ли пользователь с таким email
    const checkQuery = "SELECT * FROM users WHERE email = ?";
    console.log("Check query:", checkQuery);
    console.log("Query params:", [email]);

    const existingUser = await new Promise((resolve, reject) => {
      db.db.get(checkQuery, [email], (err, row) => {
        if (err) {
          console.error("Database error:", err);
          reject(err);
        } else {
          console.log("Found existing user:", row);
          resolve(row);
        }
      });
    });

    if (existingUser) {
      console.log("User already exists");
      return res.status(400).send("Пользователь с таким email уже существует");
    }

    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Password hashed successfully");

    // Добавляем пользователя
    const insertQuery =
      "INSERT INTO users (first_name, last_name, email, password, phone) VALUES (?, ?, ?, ?, ?)";
    console.log("Insert query:", insertQuery);
    console.log("Query params:", [
      first_name,
      last_name,
      email,
      hashedPassword,
      phone,
    ]);

    await new Promise((resolve, reject) => {
      db.db.run(
        insertQuery,
        [first_name, last_name, email, hashedPassword, phone],
        function (err) {
          if (err) {
            console.error("Database error:", err);
            reject(err);
          } else {
            console.log("User registered successfully, ID:", this.lastID);
            resolve();
          }
        }
      );
    });

    console.log("Registration successful");
    res.send("Регистрация успешно завершена");
  } catch (err) {
    console.error("=== REGISTER ERROR ===");
    console.error("Full error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).send("Ошибка сервера");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("=== LOGIN REQUEST ===");
    console.log("Request body:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      console.log("Missing email or password");
      return res.status(400).send("Email и пароль обязательны");
    }

    // Ищем пользователя
    const query = "SELECT * FROM users WHERE email = ?";
    console.log("Query:", query);
    console.log("Query params:", [email]);

    const user = await new Promise((resolve, reject) => {
      db.db.get(query, [email], (err, row) => {
        if (err) {
          console.error("Database error:", err);
          reject(err);
        } else {
          console.log("Found user:", row);
          resolve(row);
        }
      });
    });

    if (!user) {
      console.log("User not found");
      return res.status(401).send("Пользователь не найден");
    }

    // Проверяем пароль
    const validPassword = await bcrypt.compare(password, user.password);
    console.log("Password valid:", validPassword);

    if (!validPassword) {
      console.log("Invalid password");
      return res.status(401).send("Неверный пароль");
    }

    // Устанавливаем куку
    res.cookie("userId", user.id_u, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    });

    console.log("Login successful, cookie set");
    res.send("Вход выполнен успешно");
  } catch (err) {
    console.error("=== LOGIN ERROR ===");
    console.error("Full error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).send("Ошибка сервера");
  }
});

// Check auth status
app.get("/api/auth/check", (req, res) => {
  console.log("=== CHECK AUTH REQUEST ===");
  console.log("Request headers:", req.headers);
  console.log("Request cookies:", req.cookies);
  console.log("Current userId cookie:", req.cookies.userId);

  try {
    const userId = req.cookies.userId;
    console.log("User ID from cookie:", userId);

    if (userId) {
      console.log("User is authenticated");
      res.json({ authenticated: true });
    } else {
      console.log("User is not authenticated");
      res.json({ authenticated: false });
    }
  } catch (error) {
    console.error("Error during auth check:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Ошибка при проверке авторизации" });
  }
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

// User info route
app.get("/api/user/info", async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).json({ error: "Необходимо авторизоваться" });
    }

    const user = await db.read("users", { id_u: userId });
    if (!user || user.length === 0) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    // Не отправляем пароль
    const { password, ...userInfo } = user[0];
    res.json(userInfo);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Ошибка при получении информации о пользователе" });
  }
});

// Orders route
app.get("/api/orders", async (req, res) => {
  try {
    const userId = req.cookies.userId;
    console.log("=== GET ORDERS REQUEST ===");
    console.log("User ID:", userId);

    if (!userId) {
      console.log("No user ID in cookies");
      return res.status(401).json({ error: "Необходимо авторизоваться" });
    }

    // Получаем заказы пользователя напрямую через SQL
    console.log("Fetching orders for user:", userId);
    const orders = await new Promise((resolve, reject) => {
      const query = "SELECT * FROM orders WHERE id_u = ? ORDER BY date DESC";

      console.log("Orders query:", query);
      console.log("Orders params:", [userId]);

      db.db.all(query, [userId], (err, rows) => {
        if (err) {
          console.error("Error in orders query:", err);
          console.error("Query was:", query);
          console.error("Params were:", [userId]);
          reject(err);
        } else {
          console.log("Found orders:", JSON.stringify(rows, null, 2));
          resolve(rows || []);
        }
      });
    });

    // Для каждого заказа получаем его товары
    console.log("Fetching items for orders");
    for (const order of orders) {
      console.log("Fetching items for order:", order.id_o);
      const items = await new Promise((resolve, reject) => {
        const query =
          "SELECT order_items.*, painting.title, painting.price, painting.image FROM order_items LEFT JOIN painting ON order_items.id_p = painting.id_p WHERE order_items.id_o = ?";

        console.log("Items query:", query);
        console.log("Items params:", [order.id_o]);

        db.db.all(query, [order.id_o], (err, rows) => {
          if (err) {
            console.error("Error in items query:", err);
            console.error("Query was:", query);
            console.error("Params were:", [order.id_o]);
            reject(err);
          } else {
            console.log("Found items:", JSON.stringify(rows, null, 2));
            resolve(rows || []);
          }
        });
      });
      order.items = items;
    }

    console.log(
      "Sending response with orders:",
      JSON.stringify(orders, null, 2)
    );
    res.json(orders);
  } catch (err) {
    console.error("=== ERROR IN GET ORDERS ===");
    console.error("Full error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ error: "Ошибка при получении заказов" });
  }
});

// Create order route
app.post("/api/order/create", async (req, res) => {
  try {
    const userId = req.cookies.userId;
    if (!userId) {
      return res.status(401).json({ error: "Необходимо авторизоваться" });
    }

    const { addressship, payment, total_price } = req.body;

    // Получаем товары из корзины
    const cartItems = await db.read(
      "shopping_cart",
      { id_u: userId },
      "shopping_cart.*, painting.price",
      "LEFT JOIN painting ON shopping_cart.id_p = painting.id_p"
    );

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    // Очищаем цену от символа валюты и пробелов
    const cleanPrice = total_price.replace(/[^\d]/g, "");

    // Создаем заказ
    const orderId = await db.create("orders", {
      id_u: userId,
      date: new Date().toISOString(),
      status: "pending",
      addressship,
      payment,
      total_price: cleanPrice,
    });

    // Создаем записи о товарах в заказе
    for (const item of cartItems) {
      await db.create("order_items", {
        id_p: item.id_p,
        id_o: orderId,
        quantity: 1,
      });
    }

    // Создаем запись о транзакции
    await db.create("transactions", {
      id_o: orderId,
      id_u: userId,
      amount: cleanPrice,
      date: new Date().toISOString(),
      details: `Оплата заказа #${orderId}`,
    });

    // Очищаем корзину
    await db.delete("shopping_cart", { id_u: userId });

    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ error: "Ошибка при создании заказа" });
  }
});

// Events route
app.get("/api/events", async (req, res) => {
  try {
    // Получаем все мероприятия
    const events = await db.read("event", {}, "*", "ORDER BY date DESC");

    // Для каждого мероприятия получаем связанные картины
    for (const event of events) {
      const paintings = await db.read(
        "event_paintings",
        { event_id: event.e_id },
        "painting.*",
        "LEFT JOIN painting ON event_paintings.painting_id = painting.id_p"
      );
      event.paintings = paintings;
    }

    res.json(events);
  } catch (err) {
    console.error("Error getting events:", err);
    res.status(500).json({ error: "Ошибка при получении мероприятий" });
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
