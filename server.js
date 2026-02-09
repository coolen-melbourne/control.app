const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();
const bodyParser = require("body-parser");
const hbs = require("hbs");

const app = express();
const PORT = process.env.PORT || 3200;

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

// HBS helpers ni ro'yxatdan o'tkazish
hbs.registerHelper("json", function (context) {
  return JSON.stringify(context);
});

hbs.registerHelper("eq", function (a, b) {
  return a === b;
});

hbs.registerHelper("formatDate", function (date) {
  return new Date(date).toLocaleString("uz-UZ");
});

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

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// View engine sozlash
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

// Routes
app.get("/", (req, res) => {
  res.redirect("/user");
});

app.get("/user", async (req, res) => {
  try {
    const history = await SewingData.find().sort({ createdAt: -1 });
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
    // Barcha bandlar uchun ma'lumotlarni yig'ish
    const bands = [
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

    // Har bir band uchun jami miqdorni hisoblash
    const bandTotals = {};
    let totalAll = 0;

    for (const band of bands) {
      const data = await SewingData.find({
        band: band,
        status: { $ne: "deleted" },
      });

      const total = data.reduce((sum, item) => sum + item.quantity, 0);
      bandTotals[band] = total;
      totalAll += total;
    }

    // Grafik uchun ma'lumotlarni tayyorlash
    const chartData = bands.map((band, index) => {
      const quantity = bandTotals[band] || 0;
      // Har bir bandning foizini hisoblash (o'rtacha asosida)
      const averagePerBand = totalAll / bands.length;
      const percentage =
        averagePerBand > 0
          ? Math.min(100, Math.round((quantity / averagePerBand) * 100))
          : 0;

      // Rangni tanlash
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
        "#A8DADC",
        "#1D3557",
      ];

      return {
        band: band,
        quantity: quantity,
        percentage: percentage,
        color: colors[index % colors.length],
      };
    });

    // Eng ko'p tikuv bandini aniqlash
    let maxBand = { band: "-", quantity: 0 };
    if (chartData.length > 0) {
      maxBand = chartData.reduce((max, item) =>
        item.quantity > max.quantity ? item : max,
      );
    }

    res.render("grafik", {
      title: "Tikuv Jarayoni Grafigi",
      chartData: chartData,
      totalAll: totalAll,
      maxBand: maxBand,
    });
  } catch (error) {
    console.error(error);
    res.render("grafik", {
      title: "Tikuv Jarayoni Grafigi",
      chartData: [],
      totalAll: 0,
      maxBand: { band: "-", quantity: 0 },
    });
  }
});

app.get("/database", async (req, res) => {
  try {
    const data = await SewingData.find().sort({ createdAt: -1 });
    res.render("database", {
      title: "Ma'lumotlar Bazasi",
      data: data || [],
    });
  } catch (error) {
    console.error(error);
    res.render("database", {
      title: "Ma'lumotlar Bazasi",
      data: [],
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

// Grafikni yangilash uchun API
app.get("/api/grafik-data", async (req, res) => {
  try {
    const bands = [
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

    const bandTotals = {};
    let totalAll = 0;

    for (const band of bands) {
      const data = await SewingData.find({
        band: band,
        status: { $ne: "deleted" },
      });

      const total = data.reduce((sum, item) => sum + item.quantity, 0);
      bandTotals[band] = total;
      totalAll += total;
    }

    const chartData = bands.map((band, index) => {
      const quantity = bandTotals[band] || 0;
      const averagePerBand = totalAll / bands.length;
      const percentage =
        averagePerBand > 0
          ? Math.min(100, Math.round((quantity / averagePerBand) * 100))
          : 0;

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
        "#A8DADC",
        "#1D3557",
      ];

      return {
        band: band,
        quantity: quantity,
        percentage: percentage,
        color: colors[index % colors.length],
      };
    });

    res.json({
      success: true,
      chartData: chartData,
      totalAll: totalAll,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Grafik ma'lumotlarini olishda xatolik",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT} da ishga tushdi`);
});
