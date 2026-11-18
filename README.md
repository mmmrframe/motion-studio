# Motion Studio

Заявки на скринкасты: заказчик заполняет форму → заявка становится issue → GitHub Actions запускает Claude → готовый ролик скачивается из формы.

- Форма: https://mmmrframe.github.io/motion-studio/ (без ключа — демо-режим)
- Настройка связки: [SETUP.md](SETUP.md)
- Ролик на ТВ в офис (тексты сцен + материалы для фона): [TV_OFFICE.md](TV_OFFICE.md) · вкладка формы: https://mmmrframe.github.io/motion-studio/#tv
- Приглашения DDoS priglos (вкладка формы, JSON и скрипт для AE): [DDOS_PRIGLOS.md](DDOS_PRIGLOS.md) · форма сразу на вкладке: https://mmmrframe.github.io/motion-studio/#priglos

| Папка | Что внутри |
|---|---|
| `web/` | форма (GitHub Pages); `web/ae/` — скрипты для After Effects, `web/assets/` — логошот для предпросмотра, `web/fonts/` — Onest |
| `worker/` | Cloudflare Worker: ключи доступа, создание issue, загрузка и выдача файлов |
| `.github/workflows/` | `screencast.yml` — сборка ролика агентом, `pages.yml` — публикация формы |
| `agent/CLAUDE.md` | регламент агента |
| `scripts/` | разбор заявки, проверка результата |
| `assets/` | бренд, музыка, мокапы (Git LFS) |
| `tests/` | имитация AE для проверки скрипта DDoS priglos |

Статус заявки — метки issue: `status:queued` → `working` → `render` → `done` (или `question`, `error`).
