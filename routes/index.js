var express = require("express");
var router = express.Router();
const hbs = require("handlebars");
const db = require("../utils/queries");
var bodyParser = require("body-parser");
var urlencodedParser = bodyParser.urlencoded({ extended: false });
var passport = require("passport");
const expressValidator = require("express-validator");
const bcrypt = require("bcryptjs");

require("../config/passport");

hbs.registerHelper("formatCurrency", function(n) {
  var s = n.toString();
  var regex = /\B(?=(\d{3})+(?!\d))/g;
  var ret = s.replace(regex, ".");
  ret += " VNĐ";
  return ret;
});

hbs.registerHelper("formatDate", function(n) {
  console.log(n);
  var date = new Date(n);
  console.log(date);
  var ret =
    date.getDate() +
    "-" +
    (date.getMonth() + 1).toString() +
    "-" +
    date.getFullYear();
  return ret;
});

hbs.registerHelper("mask", function(n) {
  if (n) {
    var last5 = n.substring(n.length - 5);
    var mask = n.substring(0, n.length - 5).replace(/./g, "*");
    return mask + last5;
  }
  return n;
});

router.get("/", async function(req, res) {
  // clearInterval(timeCountdown);
  const endSoon = await db.load(
    'SELECT * FROM public."PRODUCT" ORDER BY "PRO_END" asc'
  );
  const highBid = await db.load(
    'SELECT * FROM public."PRODUCT" ORDER BY "BID_COUNT" DESC'
  );
  const highPrice = await db.load(
    'SELECT * FROM public."PRODUCT" ORDER BY "PRESENT_PRICE" DESC'
  );
  const category = await db.load('SELECT * FROM public."CATEGORY"');
  if (req.isAuthenticated() && req.user.USER_TYPE === "SELLER") {
    res.render("seller", {
      isUser: true,
      user: req.user
    });
  } else if (req.isAuthenticated() && req.user.USER_TYPE === "USER") {
    res.render("bidder", {
      endSoon: endSoon.rows.slice(0, 5),
      highBid: highBid.rows.slice(0, 5),
      highPrice: highPrice.rows.slice(0, 5),
      category: category.rows,
      isUser: true,
      user: req.user
    });
    // if (req.isAuthenticated() && req.user.USER_TYPE === "ADMIN") {
    //   res.render("admin", { user: req.user });
  } else {
    res.render("home", {
      endSoon: endSoon.rows.slice(0, 5),
      highBid: highBid.rows.slice(0, 5),
      highPrice: highPrice.rows.slice(0, 5),
      category: category.rows
    });
  }
});

router.get("/signin", function(req, res) {
  res.render("signin", { layout: false });
});

router.post(
  "/signin",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/signin",
    failureFlash: true
  })
);

router.get("/signup", function(req, res) {
  res.render("signup", { layout: false });
});

router.post(
  "/signup",
  passport.authenticate("local-signup", {
    successRedirect: "/",
    failureRedirect: "/signup",
    failureFlash: true
  })
);

router.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

router.get("/profile", async function(req, res) {
  if (req.isAuthenticated() && req.user.USER_TYPE === "SELLER") {
    res.render("sellerProfile", {
      isUser: true,
      user: req.user
    });
  } else if (req.isAuthenticated() && req.user.USER_TYPE === "USER") {
    const isJoin = await db.detail(
      `SELECT * FROM public."BID_HISTORY" H, public."PRODUCT" P WHERE H."USER_ID" = $1 AND H."PRO_ID" = P."PRO_ID"`,
      req.user.USER_ID
    );
    const isLiked = await db.detail(
      `SELECT * FROM public."WATCHLIST" H, public."PRODUCT" P WHERE H."USER_ID" = $1 AND H."PRO_ID" = P."PRO_ID"`,
      req.user.USER_ID
    );
    res.render("bidderProfile", {
      isUser: true,
      user: req.user,
      isJoin: isJoin.rows,
      isLiked: isLiked.rows
    });
  } else {
    res.render("error", { layout: false });
  }
});

router.post("/profile", async function(req, res) {
  // if (req.isAuthenticated() && req.user.USER_TYPE === "SELLER" ) {
  //   const fullname = req.
  //   res.render("sellerProfile", {
  //     isUser: true,
  //     user: req.user
  //   });
  // }
  if (req.isAuthenticated() && req.user.USER_TYPE === "USER") {
    const isJoin = await db.detail(
      `SELECT * FROM public."BID_HISTORY" H, public."PRODUCT" P WHERE H."USER_ID" = $1 AND H."PRO_ID" = P."PRO_ID"`,
      req.user.USER_ID
    );
    const isLiked = await db.detail(
      `SELECT * FROM public."WATCHLIST" H, public."PRODUCT" P WHERE H."USER_ID" = $1 AND H."PRO_ID" = P."PRO_ID"`,
      req.user.USER_ID
    );
    const salt = await bcrypt.genSaltSync(10);
    const hash = await bcrypt.hash(req.body.password, salt);
    await db.load(
      `UPDATE public."USER" SET "USER_FULLNAME" = '${req.body.fullname.toString()}', "USER_EMAIL" = '${req.body.email.toString()}', "USER_NAME" = '${req.body.username.toString()}', "USER_PASSWORD" = '${hash.toString()}'  WHERE "USER_ID" = ${
        req.user.USER_ID
      }`
    );
    const user = await db.detail(
      `SELECT * FROM public."USER" WHERE "USER_ID" = $1 `,
      req.user.USER_ID
    );
    res.render("bidderProfile", {
      isUser: true,
      user: user.rows[0],
      isJoin: isJoin.rows,
      isLiked: isLiked.rows
    });
  } else {
    res.render("error", { layout: false });
  }
});

router.get("/reset", function(req, res) {
  res.render("reset", { layout: false });
});

const updateWinner = async (seller, proID, userID) => {
  await db.load(
    `INSERT INTO PUBLIC."WINLIST" ("USER_ID", "PRO_ID") VALUES (${userID}, ${proID})`
  );
  await db.load(
    `INSERT INTO PUBLIC."SELLER_WIN" ("SELLER_ID", "BIDDER_ID", "PRO_ID", "PRO_STATUS") VALUES (${seller}, ${userID}, ${proID}, 'SUCCESS')`
  );
};

router.post("/product/:id", async function(req, res) {
  // clearInterval(timeCountdown);
  const id = req.params.id;
  if (req.isAuthenticated() && req.user.USER_TYPE === "USER") {
    var bidPrice = await req.body.price;
    var buyNow = await req.body.hasOwnProperty("buyNow");
    var like = await req.body.hasOwnProperty("like");
    if (like) {
      await db.load(
        `insert into public."WATCHLIST" ("USER_ID","PRO_ID") VALUES (${req.user.USER_ID},${id})`
      );
    }
    var price = 0;
    let cannotBuy = false;
    let isError = false;
    if (buyNow) {
      cannotBuy = true;
      const product = await db.detail(
        'SELECT * FROM public."PRODUCT" WHERE "PRO_ID" = $1 ',
        id
      );
      await db.load(
        `UPDATE public."PRODUCT" SET "PRESENT_PRICE" = ${product.rows[0].BUY_NOW}, "BID_COUNT" = "BID_COUNT" + 1, "USER_ID" = ${req.user.USER_ID}  WHERE "PRO_ID" = ${id}`
      );
      await db.load(
        `insert into public."BID_HISTORY" ("USER_ID","PRO_ID","BID_PRICE","BID_TIME","BID_STATUS") VALUES (${
          req.user.USER_ID
        },${id},${price},TO_TIMESTAMP(${Date.now() / 1000.0}),TRUE)`
      );
      updateWinner(product.rows[0].SELLER_ID, id, req.user.USER_ID);
    } else {
      if (bidPrice === "") isError = true;
      else {
        if (/^[0-9]*$/.test(bidPrice)) {
          price = Number(bidPrice);
          const product = await db.detail(
            'SELECT * FROM public."PRODUCT" WHERE "PRO_ID" = $1 ',
            id
          );
          if (
            price % product.rows[0].BID_JUMP === 0 &&
            price > product.rows[0].PRESENT_PRICE
          ) {
            await db.load(
              `UPDATE public."PRODUCT" SET "PRESENT_PRICE" = ${price}, "BID_COUNT" = "BID_COUNT" + 1, "USER_ID" = ${req.user.USER_ID} WHERE "PRO_ID" = ${id}`
            );
            await db.load(
              `insert into public."BID_HISTORY" ("USER_ID","PRO_ID","BID_PRICE","BID_TIME","BID_STATUS") VALUES (${
                req.user.USER_ID
              },${id},${price},TO_TIMESTAMP(${Date.now() / 1000.0}),TRUE)`
            );
            if (price >= product.rows[0].BUY_NOW) {
              cannotBuy = true;
              updateWinner(product.rows[0].SELLER_ID, id, req.user.USER_ID);
            }
          } else isError = true;
        } else isError = true;
      }
    }
    const newProduct = await db.detail(
      'SELECT * FROM public."PRODUCT" WHERE "PRO_ID" = $1 ',
      id
    );
    const bidder = await db.detail(
      'SELECT U."USER_NAME", P."PRESENT_PRICE" FROM public."PRODUCT" P, public."USER" U WHERE P."PRO_ID" = $1 AND P."USER_ID" = U."USER_ID"',
      id
    );
    const seller = await db.detail(
      'SELECT U."USER_NAME", P."PRESENT_PRICE" FROM public."PRODUCT" P, public."USER" U WHERE P."PRO_ID" = $1 AND P."SELLER_ID" = U."USER_ID"',
      id
    );
    const history = await db.load(
      `select * FROM PUBLIC."BID_HISTORY" H, PUBLIC."USER" U WHERE H."PRO_ID" = ${id} and U."USER_ID" = H."USER_ID" order by H."BID_PRICE" desc`
    );
    const liked = await db.load(
      `select count(*) from public."WATCHLIST" where "PRO_ID" = ${id} and "USER_ID" = ${req.user.USER_ID}`
    );
    const isLiked = liked.rows[0].count === "0" ? false : true;
    res.render("product", {
      isUser: true,
      user: req.user,
      isUser: true,
      isError: isError,
      cannotBuy: cannotBuy,
      product: newProduct.rows[0],
      bidder: bidder.rows[0],
      seller: seller.rows[0],
      recommend: newProduct.rows[0].PRESENT_PRICE + newProduct.rows[0].BID_JUMP,
      history: history.rows.splice(0, 5),
      isLiked: isLiked
    });
  }
});

router.get("/product/:id", async function(req, res) {
  // clearInterval(timeCountdown);
  const id = req.params.id;
  const product = await db.detail(
    'SELECT * FROM public."PRODUCT" WHERE "PRO_ID" = $1 ',
    id
  );
  const isBought = await db.load(
    `SELECT COUNT(*) FROM public."WINLIST" WHERE "PRO_ID" = ${id}`
  );
  var cannotBuy = false;
  if (isBought.rows[0].count !== "0") {
    cannotBuy = true;
  }
  const bidder = await db.detail(
    'SELECT U."USER_NAME", P."PRESENT_PRICE" FROM public."PRODUCT" P, public."USER" U WHERE P."PRO_ID" = $1 AND P."USER_ID" = U."USER_ID"',
    id
  );

  const seller = await db.detail(
    'SELECT U."USER_NAME", U."USER_AVA", P."PRESENT_PRICE" FROM public."PRODUCT" P, public."USER" U WHERE P."PRO_ID" = $1 AND P."SELLER_ID" = U."USER_ID"',
    id
  );

  const relativeProduct = await db.detail(
    'SELECT * FROM public."PRODUCT" WHERE "CATEGORY" = $1 ',
    product.rows[0].CATEGORY
  );
  const category = await db.load('SELECT * FROM public."CATEGORY"');

  const history = await db.load(
    `select * FROM PUBLIC."BID_HISTORY" H, PUBLIC."USER" U WHERE H."PRO_ID" = ${id} and U."USER_ID" = H."USER_ID" order by H."BID_PRICE" desc`
  );

  if (req.isAuthenticated() && req.user.USER_TYPE === "USER") {
    const liked = await db.load(
      `select count(*) from public."WATCHLIST" where "PRO_ID" = ${id} and "USER_ID" = ${req.user.USER_ID}`
    );
    const isLiked = liked.rows[0].count === "0" ? false : true;
    res.render("product", {
      isUser: true,
      user: req.user,
      isUser: true,
      isError: false,
      cannotBuy: cannotBuy,
      product: product.rows[0],
      bidder: bidder.rows[0],
      seller: seller.rows[0],
      recommend: product.rows[0].PRESENT_PRICE + product.rows[0].BID_JUMP,
      relativeProduct: relativeProduct.rows.splice(0, 5),
      category: category.rows,
      history: history.rows.splice(0, 5),
      isLiked: isLiked
    });
  } else {
    res.render("product", {
      isError: false,
      cannotBuy: cannotBuy,
      product: product.rows[0],
      bidder: bidder.rows[0],
      seller: seller.rows[0],
      recommend: product.rows[0].PRESENT_PRICE + product.rows[0].BID_JUMP,
      relativeProduct: relativeProduct.rows.splice(0, 5),
      category: category.rows,
      history: history.rows.splice(0, 5)
    });
  }
});

router.get("/:id", async function(req, res) {
  const id = req.params.id;
  const products = await db.detail(
    'SELECT * FROM public."PRODUCT" WHERE "CATEGORY" = $1 ',
    id
  );
  const cate = await db.detail(
    'SELECT * FROM public."CATEGORY" WHERE "CAT_ID" = $1 ',
    id
  );
  const category = await db.load('SELECT * FROM public."CATEGORY"');
  res.render("category", {
    products: products.rows,
    cate: cate.rows[0],
    category: category.rows
  });
});

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

module.exports = router;
