# Motion Studio: как запустить связку

```
Заказчик → форма (GitHub Pages) → Cloudflare Worker → Issue в GitHub
        → GitHub Actions → Claude (claude-code-action) → ffmpeg → R2
        → форма показывает статус и кнопку «Скачать»
```

**Кто за что отвечает.**
- **Форма** (`web/index.html`) — статичная страница без секретов.
- **Worker** хранит токены, проверяет ключ доступа, создаёт задачу в GitHub и отдаёт файлы.
- **Issue** — карточка заявки: в ней история, статус (метки) и вопросы агента.
- **Actions** запускает Claude, который собирает ролик.
- **R2** — хранилище записей и готовых роликов. Видео в git и в issue не кладём: у GitHub лимит 100 МБ на файл в репозитории, а через API файлы к issue не прикрепить.

---

## 1. Репозиторий
1. В организации на GitHub: **New repository** → `motion-studio`, **Private**.
2. Залейте структуру из архива:
   ```
   web/index.html               форма
   worker/                      Cloudflare Worker
   .github/workflows/screencast.yml
   agent/CLAUDE.md              регламент агента
   scripts/prepare.py, check_output.py
   assets/music/{calm,tech,inspire,minimal}.mp3
   assets/mockups/<scene>/{plate.png, overlay.png, mockup.json}
   assets/brand.json, assets/demo/demo_screen.mp4
   ```
3. Музыку и мокапы храните в Git LFS: `git lfs track "assets/**/*.mp3" "assets/**/*.png" "assets/**/*.mp4"`.
4. **Issues → Labels** — создайте метки: `screencast`, `status:queued`, `status:working`, `status:render`, `status:question`, `status:done`, `status:error`.

## 2. Ключ Claude для Actions
- **Settings → Secrets and variables → Actions → New secret**:
  - `ANTHROPIC_API_KEY` — ключ из console.anthropic.com (оплата по токенам);
  - или `CLAUDE_CODE_OAUTH_TOKEN`, если работаете по подписке: получить командой `claude setup-token` и в workflow заменить строку `anthropic_api_key` на `claude_code_oauth_token`.
- GitHub App Claude ставить не обязательно: workflow запускается с явным `prompt`, ему хватает секрета.

## 3. Токен, которым Worker создаёт задачи
1. Заведите отдельного пользователя-бота (например, `motion-studio-bot`) и добавьте его в репозиторий с правом **Write**.
2. От имени бота: **Settings → Developer settings → Fine-grained tokens** → доступ только к `motion-studio`, права **Issues: Read and write**, **Metadata: Read**.
3. В репозитории: **Settings → Variables → Actions** → `SUBMIT_BOT` = логин бота. Workflow берёт в работу только задачи, созданные ботом, поэтому случайная или чужая задача ничего не запустит.

> Важно: задачу нельзя создавать встроенным `GITHUB_TOKEN`, потому что его события не запускают workflow. Нужен токен бота (или GitHub App).

## 4. Cloudflare: R2 и Worker
1. **R2 → Create bucket** → `motion-studio`.
2. **R2 → Manage API tokens** → токен с правами *Object Read & Write* на этот бакет. Он даёт `Access Key ID` и `Secret`.
3. В бакете **Settings → CORS policy** разрешите загрузку из формы:
   ```json
   [{"AllowedOrigins":["https://mmmrframe.github.io"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3600}]
   ```
4. **Lifecycle rule:** удалять `uploads/` через 14 дней, `results/` — через 60.
5. Worker:
   ```bash
   cd worker && npm i
   npx wrangler login
   npx wrangler kv namespace create KEYS        # id → wrangler.toml
   # заполните REPO, ALLOWED_ORIGIN, R2_ACCOUNT_ID в wrangler.toml
   npx wrangler secret put GITHUB_TOKEN         # токен бота из п. 3
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   npx wrangler deploy                          # → https://motion-studio-api.<акк>.workers.dev
   ```
6. Ключи доступа заказчиков: `npx wrangler kv key put --binding KEYS "<случайный-ключ>" "Вадим Кокшаров"`. Персональная ссылка: `https://mmmrframe.github.io/motion-studio/?key=<ключ>` — после первого открытия ключ запоминается, и из адреса он убирается.
7. В GitHub **Secrets**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. В **Variables**: `R2_ACCOUNT_ID`, `R2_BUCKET`.

## 5. Форма
1. В `web/index.html` в блоке `CONFIG` укажите `WORKER_URL` и `REPO_URL`.
2. Страница публикуется workflow `pages.yml` из папки `web/` при каждом push в `main` (Settings → Pages → Source: GitHub Actions).
   - На бесплатном тарифе GitHub Pages для приватного репозитория недоступен. Тогда либо тариф Team, либо **Cloudflare Pages**: подключаете тот же репозиторий, build output — `web`. Это бесплатно и рядом с Worker.
   - Страница публичная, но без ключа работает только демо: все запросы проверяет Worker.
3. `ALLOWED_ORIGIN` в Worker должен совпадать с адресом формы.

## 6. Ассеты сцен
Для каждой сцены (`monitor_close`, `monitor_desk`, `monitor_orange`, `laptop_close`):
- отрендерите из AE или 3D кадр 1920×1080 с **пустым экраном** → `plate.png`;
- блики и рамку поверх экрана → `overlay.png` (с прозрачностью);
- в `mockup.json` запишите 4 угла экрана в пикселях и зону под титры.

**Логотип и 18+.** Логотип Солар уже лежит в `assets/brand/` (белый и оранжевый PNG с прозрачностью). Отступы и размер из гайда впишите в `assets/brand.json` → `logo` и `age_mark`: `margin_x`/`margin_y` — отступ от края в долях кадра, `height` — высота в долях высоты кадра. Сейчас заглушка: 4,2 % / 6,5 % / 3,7 %. В форме оба включаются переключателями на шаге «Сцена»; 18+ ставится в правый верхний угол с прозрачностью 60 %.

Это статичные мокапы: ffmpeg вписывает в них запись по перспективе. Если в мокапе должна двигаться камера, есть два пути:
- **(а)** экспортировать трек углов экрана по кадрам (CSV из AE) и подставлять запись покадрово;
- **(б)** поставить self-hosted runner на Mac с After Effects: `runs-on: [self-hosted, macOS, ae]`, Claude пишет JSX по навыку `ae-promo-video`, рендер через `aerender`.

Начинать лучше со статичных мокапов.

## 7. Проверка
1. Откройте форму без ключа и пройдите все шаги. В правой колонке, в блоке «Промт для агента», видно, что уйдёт в работу.
2. С ключом отправьте «Попробовать на примере». Ожидаемый результат: появляется issue с метками → workflow стартует → метки меняются `working` → `render` → `done`, а в форме появляется «Скачать MP4».
3. Проверьте ошибки:
   - битая ссылка → метка `status:error` и комментарий со ссылкой на лог;
   - пожелание «сделай ролик 4K вертикальный» → агент задаёт вопрос (`status:question`).
4. Ответ на вопрос агента: заказчик пишет в issue, исполнитель снимает и снова ставит метку `status:queued` — сборка перезапускается.

## 8. Кайтен
Кнопку в карточке Кайтена можно оставить, просто ведите её на форму: `…/motion-studio/?key=<ключ>&kaiten=<id карточки>`. Номер карточки попадёт в заявку и в issue.

## Стоимость и лимиты
- Actions: приватный репозиторий расходует минуты тарифа. Один ролик ≈ 5–15 минут ubuntu-runner.
- Claude: один ролик ≈ 20–60 ходов агента, зависит от числа титров.
- R2: исходящий трафик бесплатный, хранение — копейки при lifecycle-правилах.
- Worker: бесплатного тарифа (100 тыс. запросов в сутки) хватает с запасом.
