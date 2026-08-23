// Windows 샌드박스에서 uv_os_get_passwd가 실패할 때 tsx의 임시 폴더 계산을 돕는다.
// 게임 런타임에는 포함되지 않는 테스트 실행 전용 호환 계층이다.
const os = require('node:os');

os.userInfo = () => ({
  uid: -1,
  gid: -1,
  username: process.env.USERNAME || 'local-user',
  homedir: process.env.USERPROFILE || process.cwd(),
  shell: null,
});
