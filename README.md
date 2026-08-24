# ParametricSky 🛰️🌾
> **Autonomous Satellite Telemetry Weather Insurance & Crop Yield Oracle Escrow**

ParametricSky là một giao thức bảo hiểm tham số (Parametric Insurance) và phán quyết bồi thường hạn hán/thiên tai nông nghiệp phi tập trung, sử dụng dữ liệu viễn thám vệ tinh và đồng thuận trí tuệ nhân tạo (AI Consensus) trên mạng lưới **GenLayer**.

---

## 📖 Bài toán Thực tế & Giải pháp

### 1. Bài toán Thực tế
Các hợp đồng bảo hiểm mùa màng truyền thống thường mất nhiều tháng để cử giám định viên đi đo đạc thực địa, dễ xảy ra sai số, tranh chấp và thủ tục hành chính cồng kềnh. Điều này gây khó khăn rất lớn cho người nông dân khi gặp thiên tai hạn hán.

### 2. Giải pháp GenLayer
* **Ký quỹ tự động (Escrow Pool):** Công ty bảo hiểm/DeFi Pool (Underwriter) ký quỹ bồi thường lên hợp đồng thông minh.
* **Cào dữ liệu viễn thám thực tế:** Khi có thiên tai hoặc đến kỳ thu hoạch, hợp đồng tự động gọi hàm không xác định `gl.nondet.web.render` để lấy dữ liệu chỉ số thực vật viễn thám **NDVI** (Normalized Difference Vegetation Index), nhiệt độ bề mặt đất và lượng mưa thực tế từ các trạm khí tượng (Open-Meteo, NOAA/Copernicus Sentinel telemetry).
* **AI Consensus Phán quyết:** AI Consensus đối chiếu ma trận suy giảm NDVI và chuỗi nhiệt độ liên tục vượt ngưỡng $\ge 38^\circ\text{C}$ quá $14$ ngày so với điều khoản hợp đồng để tự động xuất lệnh bồi thường theo tỷ lệ phần trăm thiệt hại (Tiered Payout) hoàn toàn minh bạch mà không cần con người can thiệp.

---

## 🛠️ Cấu trúc dự án

```
├── contracts/
│   └── ParametricSky.py        # GenLayer Intelligent Contract (Python)
├── tests/
│   └── test_parametric_sky.py  # Test suite với Mock GenLayer VM
├── scripts/
│   └── verify_contract.py      # Script chạy mock tests & verify cú pháp contract
├── frontend/                   # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── App.tsx             # Giao diện GIS Map & NDVI Spectral Curve Chart
│   │   └── ...
│   └── package.json
└── README.md                   # Tài liệu hướng dẫn sử dụng
```

---

## 🚀 Hướng dẫn Bắt đầu

### 1. Yêu cầu Hệ thống
* Python 3.10+
* Node.js v18+ và npm

### 2. Chạy Smart Contract & Kiểm thử Unit Test
Để chạy bộ test suite tự động kiểm tra các tình huống bồi thường do hạn hán, tranh chấp hợp đồng (dispute) và trọng tài xử lý (arbitration):
```bash
python -m unittest tests/test_parametric_sky.py
```
Hoặc chạy script xác thực tổng thể:
```bash
python scripts/verify_contract.py
```

### 3. Deploy Contract lên Studionet
Sử dụng GenLayer CLI để deploy contract:
```bash
genlayer deploy --contract contracts/ParametricSky.py
```

### 4. Setup & Chạy Frontend Local
Di chuyển vào thư mục `frontend/`, cài đặt các thư viện và chạy máy chủ phát triển local:
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Mở trình duyệt theo địa chỉ `http://localhost:5173`.

---

## 📡 Ý Tưởng Giao Diện (Vibe: GIS Geo-Spatial Satellite Map Terminal)

* **Phong cách Visual:** Topographic Geo-Satellite Surveillance Terminal — Bảng điều khiển vệ tinh viễn thám không gian địa lý.
* **Bản màu (Theme):** Earth Radar Charcoal (`#0B0F12`), Crop Golden/Wheat (`#EAB308`), Satellite Cyan (`#38BDF8`) và Drought Hazard Red (`#DC2626`).
* **Tính năng UI độc đáo:**
  * **Interactive Satellite Coordinates Pinning:** Bản đồ radar tương tác cho phép chọn tọa độ GPS nông trại, tự động trích xuất mã trạm khí tượng vùng và URL telemetry.
  * **NDVI Multi-Spectrum Spectral Curve Chart:** Biểu đồ hiển thị đường cong suy giảm diệp lục NDVI đối chiếu với ngưỡng kích hoạt bảo hiểm $0.25$.
  * **Autonomous Claim Execution Pipeline:** Hiển thị 4 radar quét: `[Satellite Data Ingestion]`, `[NDVI Index Calculation]`, `[Weather Station Validation]`, `[Consensus Automated Payout]`.
  * **Simulator Mode / Live Studionet:** Cho phép chạy thử đầy đủ kịch bản nghiệp vụ bảo hiểm ở chế độ Mock hoặc kết nối ví MetaMask thông qua `genlayer-js` trên mạng `studionet`.
