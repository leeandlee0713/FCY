# FCY 저장소 작업 규칙

이 저장소 하나가 공통 원본이다. Codex와 Claude 어느 쪽에서 작업하든 여기에 커밋하고 푸시하면 같은 사이트에 반영된다.

## 공개 주소 (GitHub Pages, 기본 브랜치 루트에서 배포)

| 사이트 | 폴더 | 주소 |
|---|---|---|
| FCY Tactical Board | 저장소 루트 | https://leeandlee0713.github.io/FCY/ |
| SPOT (전국 유·청소년 축구팀 찾기) | 별도 저장소 `leeandlee0713/spot-site` | https://spot-12324.web.app |

## 작업 순서

1. 시작 전에 기본 브랜치 `claude/brave-lamport-jo5t6s`의 최신 내용을 받는다 (`git pull origin claude/brave-lamport-jo5t6s`). 다른 쪽에서 고친 내용 위에서 작업해야 한다.
2. 수정한다. 두 사이트 모두 빌드가 없는 정적 파일이다. `python3 -m http.server 8000`으로 띄워 확인한다.
3. 커밋하고 기본 브랜치에 푸시한다. 푸시 후 1~2분이면 위 주소에 반영된다.
4. 푸시가 거절되면(상대가 먼저 푸시한 경우) 다시 받아 합친 뒤 푸시한다. 강제 푸시는 하지 않는다.

## 폴더별 안내

- 루트의 전술 보드: `README.md`
- SPOT은 이 저장소에서 고치지 않는다. 정본은 `leeandlee0713/spot-site`의 `main`이고, 그 저장소의 `WORKFLOW.md`를 따른다. 이 저장소의 `spot/`은 옛 주소를 새 주소로 넘겨 주는 안내 페이지뿐이다.
