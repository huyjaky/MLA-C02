# MLA-C01 Study Box

Web ôn thi AWS Certified Machine Learning Engineer – Associate, dựng từ khóa học nằm ngoài repo này (video, phụ đề, slide, tài liệu không có trong git).
Song ngữ EN/VI: bài giảng (video + phụ đề đồng bộ), quiz & đề thi thử, flashcard Leitner, thuật ngữ, ghi chú giảng viên.

## Chạy bằng Docker (khuyên dùng)

```bash
cp .env.example .env                     # lần đầu, trỏ các đường dẫn tới thư mục khóa học
docker compose up -d --build             # http://localhost:8080
```

- Image chỉ chứa app đã build (~255 MB). Video, slide, tài liệu được mount **chỉ đọc** từ các đường dẫn trong `.env`;
  tài khoản + tiến độ nằm ở `./data/study.db` trên máy (dùng chung với `npm run dev`), nên còn nguyên khi rebuild/xoá container.
- Container tự khởi động lại khi bật máy/Docker (`restart: unless-stopped`).
- Cập nhật sau khi sửa code hoặc nội dung JSON: `docker compose up -d --build`. Xem log: `docker compose logs -f`. Dừng: `docker compose down`.
- Máy khác trong mạng LAN mở `http://<IP máy này>:8080` (Windows có thể hỏi mở firewall). Kết nối là HTTP thường;
  đừng mở cổng này ra internet: video khoá học có bản quyền.

Phụ đề nằm trong `app/content/subtitles/`, mỗi ngôn ngữ một thư mục: `en/`, `vi/`, `vi-ai/`. `python scripts/import_course.py` chỉ tạo lại `en/` và `vi/` từ file .srt; `vi-ai/` do AI viết nên chỉ sửa trực tiếp.

## Chạy để phát triển

```bash
conda env create -f environment.yml      # lần đầu (Python 3.12 + Node 22)
cp .env.example .env                     # lần đầu, rồi sửa đường dẫn nếu khóa học nằm chỗ khác
conda activate mla-c01
cd app && npm install                    # lần đầu
npm run dev                              # http://localhost:5173
```

Đường dẫn tới nguồn khóa học khai báo trong `.env` ở thư mục gốc (đường dẫn tương đối tính từ thư mục gốc, hoặc tuyệt đối):

| Biến | Nội dung | Phục vụ tại |
|---|---|---|
| `COURSE_DIR` | thư mục chứa các `NN - Section/` (video .mp4 + phụ đề `_en/_vi.srt`) | `/media` |
| `MATERIALS_DIR` | thư mục tài liệu lab (MLA-C02-Materials) | `/materials` |
| `SLIDES_FILE` | file slide PDF | `/slides` |
| `DB_FILE` | file SQLite chứa tài khoản + tiến độ | `/api` |

Sau khi đổi `.env`: khởi động lại `npm run dev`; nếu đổi `COURSE_DIR` sang bộ khóa học khác thì chạy lại `scripts/import_course.py`.
Tài khoản: mở web sẽ gặp trang Đăng nhập / Đăng ký. Mỗi tài khoản có tiến độ riêng (bài đã xem, vị trí video,
điểm quiz, câu sai, flashcard, cài đặt), lưu trong SQLite tại `DB_FILE` (mặc định `data/study.db`) qua API `/api`
chạy cùng `npm run dev` / `npm run preview` (mã ở `app/server/StudyApi.js`). Mật khẩu được hash bằng scrypt;
phiên đăng nhập là cookie HttpOnly, hết hạn sau 30 ngày. Sao lưu = copy file `data/study.db`.

## Cấu trúc

```
environment.yml            conda env
scripts/
  import_course.py         .html + .srt  ->  app/content/*.json
  validate_content.py      kiểm tra JSON (đủ bản dịch vi, thẻ HTML khớp, đáp án hợp lệ)
app/
  content/                 TOÀN BỘ dữ liệu (JSON)
    sections/NN.json       phần + bài giảng {id, title:{en,vi}, kind, video, transcript}
    quizzes/*.json         quiz/đề thi {id, kind, section, title, passPercent, questions[]}
    glossary/NN.json       thuật ngữ {section, terms:[{id, term, lecture, definition:{en,vi}}]}
    notes/*.json           ghi chú giảng viên {id, section, title, body}
    subtitles/<en|vi|vi-ai>/NN.json   phụ đề {lectureId: [[start,end,text]]}
    ui/en.json, vi.json    chuỗi giao diện
  src/
    core/                  class nghiệp vụ, không phụ thuộc React
      ContentRepository    nạp & tra cứu nội dung
      ProgressTracker      tiến độ (kế thừa PersistentStore)
      QuizSession          một lượt làm quiz (luyện tập / thi có giờ)
      LeitnerScheduler     lịch ôn flashcard 5 ngăn
      TranscriptTrack      tra phụ đề theo thời gian
      Localizer            chọn ngôn ngữ cho cặp {en,vi} và chuỗi UI
    state/                 React context nối core với UI
    components/            thành phần dùng chung (BiText, SectionTab, Stamp, ...)
    pages/                 mỗi route một trang
    styles/                tokens.css, base.css, components.css, pages.css
  scripts/selfcheck.mjs    kiểm tra nhanh các class core (npm run check)
```

## Thêm nội dung

Mọi file JSON đặt vào `app/content/<loại>/` được app tự nhận, không cần sửa code.

- **Thêm câu hỏi**: thêm một object vào `questions` của file trong `app/content/quizzes/`
  (hoặc tạo file quiz mới), ví dụ:
  ```json
  {
    "id": 900001,
    "multi": false,
    "question": { "en": "<p>Which service ...?</p>", "vi": "<p>Dịch vụ nào ...?</p>" },
    "options": [ { "en": "Amazon S3", "vi": "Amazon S3" }, { "en": "Amazon EBS", "vi": "Amazon EBS" } ],
    "answer": [0],
    "feedback": [ { "en": "Correct ...", "vi": "Đúng ..." }, { "en": "Incorrect ...", "vi": "Sai ..." } ]
  }
  ```
  `answer` là chỉ số (từ 0) của đáp án đúng; nhiều đáp án thì `"multi": true`. `id` phải là số duy nhất.
- **Thêm thuật ngữ / flashcard**: thêm vào `terms` trong `app/content/glossary/NN.json`.
- **Gắn tài liệu cho bài giảng**: thêm `"materials": ["s3/coffee.jpg"]` (đường dẫn tính từ `MATERIALS_DIR`)
  vào bài trong `app/content/sections/NN.json`. File slide chung lấy từ `SLIDES_FILE` trong `.env`.
- Sau khi sửa: `python scripts/validate_content.py`.
- `python scripts/import_course.py` chỉ ghi file chưa tồn tại (thêm `--force` sẽ ghi đè và mất bản dịch).
- **Thêm đề thi thử từ file HTML** (cùng định dạng Udemy quiz): `python scripts/import_course.py --exam "../more ex/"*.html`
  → `app/content/quizzes/practice-test-N.json` (phần `vi` để trống, cần dịch rồi chạy `validate_content.py`).
  Sau đó chạy `python scripts/localize_images.py` để tải ảnh trong đề về `app/public/quiz-images/`
  (dùng offline và để nút "Copy ảnh" hoạt động, vì CDN ảnh gốc không cho trình duyệt đọc dữ liệu ảnh).
