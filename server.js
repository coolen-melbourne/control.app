const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();
const bodyParser = require("body-parser");
const hbs = require("hbs");

const app = express();
const PORT = process.env.PORT || 3400;

// MongoDB ulanishi
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB ga muvaffaqiyatli ulandi"))
  .catch((err) => console.log("❌ MongoDB ulanish xatosi: ", err));

// Ma'lumotlar uchun Schema va Model
const sewingDataSchema = new mongoose.Schema({
  band: String,
  quantity: Number,
  status: String,
  operation: String,
  date: String,
  time: String,
  createdAt: { type: Date, default: Date.now },
});

const SewingData = mongoose.model("SewingData", sewingDataSchema);

// Oylik reytinglar uchun Schema
const monthlyRankingSchema = new mongoose.Schema({
  band: String,
  totalQuantity: Number,
  rank: Number,
  month: String, // Format: YYYY-MM
  createdAt: { type: Date, default: Date.now },
});

const MonthlyRanking = mongoose.model("MonthlyRanking", monthlyRankingSchema);

// ============ HBS HELPERS ============
// JSON helper
hbs.registerHelper("json", function (context) {
  return JSON.stringify(context);
});

// Equality helper
hbs.registerHelper("eq", function (a, b) {
  return a === b;
});

// Not equal helper
hbs.registerHelper("ne", function (a, b) {
  return a !== b;
});

// Greater than helper
hbs.registerHelper("gt", function (a, b) {
  return a > b;
});

// Greater than or equal helper
hbs.registerHelper("gte", function (a, b) {
  return a >= b;
});

// Less than helper
hbs.registerHelper("lt", function (a, b) {
  return a < b;
});

// Less than or equal helper
hbs.registerHelper("lte", function (a, b) {
  return a <= b;
});

// Format date helper
hbs.registerHelper("formatDate", function (date) {
  return new Date(date).toLocaleString("uz-UZ");
});

// Max chart data helper
hbs.registerHelper("maxChartData", function (data) {
  if (!data || data.length === 0) return { band: "-", quantity: 0 };

  let max = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i].quantity > max.quantity) {
      max = data[i];
    }
  }
  return max;
});

// Divide helper
hbs.registerHelper("divide", function (a, b) {
  if (b === 0) return 0;
  return Math.round(a / b);
});

// Get ordinal helper (1st, 2nd, 3rd)
hbs.registerHelper("getOrdinal", function (n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
});

// Lookup helper
hbs.registerHelper("lookup", function (obj, key) {
  return obj && obj[key];
});

// Or helper
hbs.registerHelper("or", function () {
  const args = Array.prototype.slice.call(arguments, 0, -1);
  return args.some((arg) => arg);
});

// And helper
hbs.registerHelper("and", function () {
  const args = Array.prototype.slice.call(arguments, 0, -1);
  return args.every((arg) => arg);
});

// If condition helper
hbs.registerHelper("ifCond", function (v1, operator, v2, options) {
  switch (operator) {
    case "==":
      return v1 == v2 ? options.fn(this) : options.inverse(this);
    case "===":
      return v1 === v2 ? options.fn(this) : options.inverse(this);
    case "!=":
      return v1 != v2 ? options.fn(this) : options.inverse(this);
    case "!==":
      return v1 !== v2 ? options.fn(this) : options.inverse(this);
    case "<":
      return v1 < v2 ? options.fn(this) : options.inverse(this);
    case "<=":
      return v1 <= v2 ? options.fn(this) : options.inverse(this);
    case ">":
      return v1 > v2 ? options.fn(this) : options.inverse(this);
    case ">=":
      return v1 >= v2 ? options.fn(this) : options.inverse(this);
    case "&&":
      return v1 && v2 ? options.fn(this) : options.inverse(this);
    case "||":
      return v1 || v2 ? options.fn(this) : options.inverse(this);
    default:
      return options.inverse(this);
  }
});

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// View engine sozlash
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

// Bugungi sanani olish
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Oylik reytinglarni hisoblash va yangilash funksiyasi
async function updateMonthlyRankings() {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Avvalgi reytinglarni o'chirish
    await MonthlyRanking.deleteMany({ month: currentMonth });

    // Oylik statistikani hisoblash
    const monthlyStats = await SewingData.aggregate([
      {
        $match: {
          createdAt: { $gte: firstDayOfMonth },
          status: { $ne: "deleted" },
        },
      },
      {
        $group: {
          _id: "$band",
          totalQuantity: { $sum: "$quantity" },
        },
      },
      {
        $sort: { totalQuantity: -1 },
      },
    ]);

    // Faqat tikuv bandlarini (1-14) hisoblash
    const sewingBands = monthlyStats.filter(
      (stat) =>
        stat._id.includes("band") &&
        !stat._id.includes("Dazmol") &&
        !stat._id.includes("Upakovka"),
    );

    // Eng yaxshi 3 ta bandni olish
    const topThree = sewingBands.slice(0, 3);

    // Reytinglarni saqlash
    for (let i = 0; i < topThree.length; i++) {
      await MonthlyRanking.create({
        band: topThree[i]._id,
        totalQuantity: topThree[i].totalQuantity,
        rank: i + 1,
        month: currentMonth,
      });
    }

    console.log(
      `✅ Oylik reytinglar yangilandi: ${topThree.map((b) => b._id).join(", ")}`,
    );
  } catch (error) {
    console.error("Reytinglarni yangilashda xatolik:", error);
  }
}

// Routes
app.get("/", (req, res) => {
  res.redirect("/user");
});

app.get("/user", async (req, res) => {
  try {
    const history = await SewingData.find().sort({ createdAt: -1 }).limit(100);
    res.render("user", {
      title: "Tikuv Nazorati Paneli",
      history: history || [],
    });
  } catch (error) {
    console.error(error);
    res.render("user", {
      title: "Tikuv Nazorati Paneli",
      history: [],
    });
  }
});

app.get("/grafik", async (req, res) => {
  try {
    // Barcha bandlar ro'yxati
    const allBands = [
      "1-band",
      "2-band",
      "3-band",
      "4-band",
      "5-band",
      "6-band",
      "7-band",
      "8-band",
      "9-band",
      "10-band",
      "11-band",
      "12-band",
      "13-band",
      "14-band",
      "Dazmol bandi",
      "Upakovka bandi",
    ];

    // Bugungi sana uchun hisob-kitob
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Har bir band uchun ma'lumotlarni yig'amiz
    const bandData = {};
    let totalTikuv = 0;
    let totalDazmol = 0;
    let totalUpakovka = 0;
    let totalAll = 0;

    for (const band of allBands) {
      const data = await SewingData.find({
        band: band,
        status: { $ne: "deleted" },
        createdAt: { $gte: today, $lte: todayEnd },
      });

      const total = data.reduce((sum, item) => sum + item.quantity, 0);
      bandData[band] = total;

      // Kategoriyalar bo'yicha yig'indilar
      if (band === "Dazmol bandi") {
        totalDazmol += total;
      } else if (band === "Upakovka bandi") {
        totalUpakovka += total;
      } else {
        totalTikuv += total;
      }
      totalAll += total;
    }

    // Grafik uchun ma'lumotlarni tayyorlash
    const chartData = allBands.map((band, index) => {
      const quantity = bandData[band] || 0;

      // Band turiga qarab kunlik maqsadni belgilash
      let dailyTarget;
      let color;

      if (band === "Dazmol bandi") {
        dailyTarget = 500; // Dazmol uchun kunlik maqsad
        color = "#8B5CF6"; // Binafsha rang
      } else if (band === "Upakovka bandi") {
        dailyTarget = 500; // Upakovka uchun kunlik maqsad
        color = "#06B6D4"; // Havo rang
      } else {
        dailyTarget = 1000; // Tikuv bandlari uchun kunlik maqsad

        // Tikuv bandlari uchun ranglar
        const colors = [
          "#5EB344",
          "#FCB72A",
          "#F8821A",
          "#E0393E",
          "#963D97",
          "#069CDB",
          "#2A9D8F",
          "#457B9D",
          "#E9C46A",
          "#F4A261",
          "#E76F51",
          "#264653",
          "#2A9D8F",
          "#E63946",
        ];
        color = colors[index % colors.length];
      }

      // Foizni hisoblash
      let percentage = dailyTarget > 0 ? (quantity / dailyTarget) * 100 : 0;

      // 100% dan oshgan holatda ham to'g'ri ko'rsatish
      if (percentage > 100) {
        percentage = 100 + Math.min(percentage - 100, 50); // Maksimum 150% gacha ko'rsatish
      }

      return {
        band: band,
        quantity: quantity,
        target: dailyTarget,
        percentage: Math.min(Math.round(percentage), 150),
        color: color,
        type:
          band === "Dazmol bandi"
            ? "dazmol"
            : band === "Upakovka bandi"
              ? "upakovka"
              : "tikuv",
      };
    });

    // Oylik statistikani hisoblash
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyStats = await SewingData.aggregate([
      {
        $match: {
          createdAt: { $gte: firstDayOfMonth },
          status: { $ne: "deleted" },
        },
      },
      {
        $group: {
          _id: "$band",
          totalQuantity: { $sum: "$quantity" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { totalQuantity: -1 },
      },
    ]);

    // Oylik reytinglarni olish
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyRankings = await MonthlyRanking.find({
      month: currentMonth,
    }).sort({ rank: 1 });

    // Reytinglarni band nomi bo'yicha tez kirish uchun obyektga o'tkazamiz
    const monthlyRankingsByBand = {};
    monthlyRankings.forEach((ranking) => {
      monthlyRankingsByBand[ranking.band] = ranking;
    });

    // Eng ko'p tikuv bandini aniqlash
    let maxBand = { band: "-", quantity: 0 };
    if (chartData.length > 0) {
      maxBand = chartData.reduce((max, item) =>
        item.quantity > max.quantity ? item : max,
      );
    }

    const todayDate = new Date().toLocaleDateString("uz-UZ", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    res.render("grafik", {
      title: "Tikuv Jarayoni Grafigi",
      chartData: chartData,
      totalTikuv: totalTikuv,
      totalDazmol: totalDazmol,
      totalUpakovka: totalUpakovka,
      totalAll: totalAll,
      maxBand: maxBand,
      monthlyStats: monthlyStats || [],
      monthlyRankings: monthlyRankings || [],
      monthlyRankingsByBand: monthlyRankingsByBand,
      todayDate: todayDate,
    });
  } catch (error) {
    console.error("Grafik sahifasi xatosi:", error);
    res.render("grafik", {
      title: "Tikuv Jarayoni Grafigi",
      chartData: [],
      totalTikuv: 0,
      totalDazmol: 0,
      totalUpakovka: 0,
      totalAll: 0,
      maxBand: { band: "-", quantity: 0 },
      monthlyStats: [],
      monthlyRankings: [],
      monthlyRankingsByBand: {},
      todayDate: new Date().toLocaleDateString("uz-UZ"),
    });
  }
});

app.get("/database", async (req, res) => {
  try {
    const data = await SewingData.find().sort({ createdAt: -1 }).limit(500);

    // Oylik reytinglarni olish
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyRankings = await MonthlyRanking.find({
      month: currentMonth,
    }).sort({ rank: 1 });

    // Oylik statistikani hisoblash
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyData = await SewingData.aggregate([
      {
        $match: {
          createdAt: { $gte: firstDayOfMonth },
          status: { $ne: "deleted" },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalSewing: {
            $sum: {
              $cond: [
                { $regexMatch: { input: "$band", regex: /^[0-9]+-band$/ } },
                "$quantity",
                0,
              ],
            },
          },
          totalUpakovka: {
            $sum: {
              $cond: [{ $eq: ["$band", "Upakovka bandi"] }, "$quantity", 0],
            },
          },
          totalDazmol: {
            $sum: {
              $cond: [{ $eq: ["$band", "Dazmol bandi"] }, "$quantity", 0],
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: -1 },
      },
    ]);

    res.render("database", {
      title: "Ma'lumotlar Bazasi",
      data: data || [],
      monthlyData: monthlyData || [],
      monthlyRankings: monthlyRankings || [],
      currentMonth: currentMonth,
    });
  } catch (error) {
    console.error(error);
    res.render("database", {
      title: "Ma'lumotlar Bazasi",
      data: [],
      monthlyData: [],
      monthlyRankings: [],
      currentMonth: new Date().toLocaleDateString("uz-UZ", {
        year: "numeric",
        month: "2-digit",
      }),
    });
  }
});

// API endpoints
app.post("/api/add", async (req, res) => {
  try {
    const { band, quantity } = req.body;

    const now = new Date();
    const time = now.toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const date = now.toLocaleDateString("uz-UZ", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const newData = new SewingData({
      band: band,
      quantity: parseInt(quantity),
      status: "added",
      operation: "Yangi ish qo'shildi",
      date: date,
      time: time,
    });

    await newData.save();

    // Agar oyning oxiri bo'lsa, reytinglarni yangilash
    const today = new Date();
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    );
    if (today.getDate() === lastDayOfMonth.getDate()) {
      await updateMonthlyRankings();
    }

    res.json({
      success: true,
      message: "Ma'lumot muvaffaqiyatli saqlandi",
      data: newData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Saqlashda xatolik yuz berdi",
    });
  }
});

app.put("/api/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const now = new Date();
    const time = now.toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const date = now.toLocaleDateString("uz-UZ", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const updatedData = await SewingData.findByIdAndUpdate(
      id,
      {
        quantity: parseInt(quantity),
        status: "updated",
        operation: "Miqdor yangilandi",
        date: date,
        time: time,
      },
      { new: true },
    );

    res.json({
      success: true,
      message: "Ma'lumot muvaffaqiyatli yangilandi",
      data: updatedData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Yangilashda xatolik yuz berdi",
    });
  }
});

app.delete("/api/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const now = new Date();
    const time = now.toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const date = now.toLocaleDateString("uz-UZ", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const deletedData = await SewingData.findByIdAndUpdate(
      id,
      {
        status: "deleted",
        operation: "O'chirildi",
        date: date,
        time: time,
      },
      { new: true },
    );

    res.json({
      success: true,
      message: "Ma'lumot muvaffaqiyatli o'chirildi",
      data: deletedData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "O'chirishda xatolik yuz berdi",
    });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const data = await SewingData.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Ma'lumotlarni olishda xatolik",
    });
  }
});

// Grafik uchun API
app.get("/api/grafik-data", async (req, res) => {
  try {
    const allBands = [
      "1-band",
      "2-band",
      "3-band",
      "4-band",
      "5-band",
      "6-band",
      "7-band",
      "8-band",
      "9-band",
      "10-band",
      "11-band",
      "12-band",
      "13-band",
      "14-band",
      "Dazmol bandi",
      "Upakovka bandi",
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const bandData = {};
    let totalTikuv = 0;
    let totalDazmol = 0;
    let totalUpakovka = 0;

    for (const band of allBands) {
      const data = await SewingData.find({
        band: band,
        status: { $ne: "deleted" },
        createdAt: { $gte: today, $lte: todayEnd },
      });

      const total = data.reduce((sum, item) => sum + item.quantity, 0);
      bandData[band] = total;

      if (band === "Dazmol bandi") {
        totalDazmol += total;
      } else if (band === "Upakovka bandi") {
        totalUpakovka += total;
      } else {
        totalTikuv += total;
      }
    }

    const chartData = allBands.map((band, index) => {
      const quantity = bandData[band] || 0;

      let dailyTarget;
      let color;

      if (band === "Dazmol bandi") {
        dailyTarget = 500;
        color = "#8B5CF6";
      } else if (band === "Upakovka bandi") {
        dailyTarget = 500;
        color = "#06B6D4";
      } else {
        dailyTarget = 1000;
        const colors = [
          "#5EB344",
          "#FCB72A",
          "#F8821A",
          "#E0393E",
          "#963D97",
          "#069CDB",
          "#2A9D8F",
          "#457B9D",
          "#E9C46A",
          "#F4A261",
          "#E76F51",
          "#264653",
          "#2A9D8F",
          "#E63946",
        ];
        color = colors[index % colors.length];
      }

      let percentage = dailyTarget > 0 ? (quantity / dailyTarget) * 100 : 0;

      if (percentage > 100) {
        percentage = 100 + Math.min(percentage - 100, 50);
      }

      return {
        band: band,
        quantity: quantity,
        target: dailyTarget,
        percentage: Math.min(Math.round(percentage), 150),
        color: color,
        type:
          band === "Dazmol bandi"
            ? "dazmol"
            : band === "Upakovka bandi"
              ? "upakovka"
              : "tikuv",
      };
    });

    res.json({
      success: true,
      chartData: chartData,
      totalTikuv: totalTikuv,
      totalDazmol: totalDazmol,
      totalUpakovka: totalUpakovka,
      totalAll: totalTikuv + totalDazmol + totalUpakovka,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Grafik ma'lumotlarini olishda xatolik",
    });
  }
});

// Reytinglarni yangilash API
app.post("/api/update-rankings", async (req, res) => {
  try {
    await updateMonthlyRankings();

    res.json({
      success: true,
      message: "Oylik reytinglar yangilandi",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Reytinglarni yangilashda xatolik",
    });
  }
});

// Har kuni tungi 12:00 da reytinglarni yangilash
setInterval(async () => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    const today = new Date();
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    );
    if (today.getDate() === lastDayOfMonth.getDate()) {
      await updateMonthlyRankings();
      console.log("Oylik reytinglar avtomatik yangilandi");
    }
  }
}, 60000); // Har minut tekshirish

app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT} da ishga tushdi`);
});
