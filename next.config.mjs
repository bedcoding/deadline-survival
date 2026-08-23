/**
 * dev 와 build 의 출력 디렉토리를 분리한다.
 *
 * 같은 .next 를 쓰면 dev 서버가 떠 있는 상태에서 `npm run build` 를 돌리는 순간
 * 프로덕션 산출물이 dev 청크를 덮어써서 실행 중인 서버가 깨진다.
 *   → Cannot find module './833.js'
 *   → __webpack_modules__[moduleId] is not a function
 * 한 번 겪었고, 분리해두면 다시는 안 겪는다.
 */
const isDev = process.env.NODE_ENV === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: isDev ? '.next-dev' : '.next',
};

export default nextConfig;
