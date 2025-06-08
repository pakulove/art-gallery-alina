CREATE TABLE users (
  id_u INTEGER NOT NULL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'user'
);

CREATE TABLE "order" (
  id_o INTEGER NOT NULL PRIMARY KEY,
  id_u INTEGER NOT NULL,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  addressship TEXT NOT NULL,
  payment TEXT NOT NULL,
  total_price DECIMAL(5,0) NOT NULL,
  FOREIGN KEY (id_u) REFERENCES users (id_u)
);

CREATE TABLE painting (
  id_p INTEGER NOT NULL PRIMARY KEY,
  title TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  available INTEGER DEFAULT 1 NOT NULL,
  style TEXT NOT NULL,
  artist_last_name TEXT,
  artist_first_name TEXT
);

CREATE TABLE order_items (
  id_i INTEGER NOT NULL PRIMARY KEY,
  id_p INTEGER NOT NULL,
  id_o INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  FOREIGN KEY (id_p) REFERENCES painting (id_p),
  FOREIGN KEY (id_o) REFERENCES "order" (id_o)
);

CREATE TABLE review (
  id_r INTEGER NOT NULL PRIMARY KEY,
  id_p INTEGER NOT NULL,
  id_u INTEGER NOT NULL,
  comment TEXT,
  review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_p) REFERENCES painting (id_p),
  FOREIGN KEY (id_u) REFERENCES users (id_u)
);

CREATE TABLE "transaction" (
  id_t INTEGER NOT NULL PRIMARY KEY,
  id_o INTEGER NOT NULL,
  id_u INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details TEXT,
  FOREIGN KEY (id_o) REFERENCES "order" (id_o),
  FOREIGN KEY (id_u) REFERENCES users (id_u)
);

CREATE TABLE shopping_cart (
  id_p INTEGER NOT NULL,
  id_u INTEGER NOT NULL,
  id_sc INTEGER NOT NULL,
  dateadd TEXT NOT NULL,
  PRIMARY KEY (id_p, id_u, id_sc),
  FOREIGN KEY (id_p) REFERENCES painting (id_p),
  FOREIGN KEY (id_u) REFERENCES users (id_u)
);

CREATE TABLE event (
	e_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	date TIMESTAMP NOT NULL, 
	CONSTRAINT event_pk PRIMARY KEY (e_id)
);

CREATE TABLE event_paintings (
	event_id INTEGER,
	painting_id INTEGER,
	CONSTRAINT EVENT_PAINTINGS_PK PRIMARY KEY (event_id,painting_id),
	CONSTRAINT event_paintings_event_FK FOREIGN KEY (event_id) REFERENCES event(e_id) ON DELETE SET NULL ON UPDATE SET NULL,
	CONSTRAINT event_paintings_painting_FK FOREIGN KEY (painting_id) REFERENCES painting(id_p) ON DELETE SET NULL ON UPDATE SET NULL
);