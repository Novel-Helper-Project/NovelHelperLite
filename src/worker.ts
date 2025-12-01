type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 交给静态资源绑定处理
    return env.ASSETS.fetch(request);
  },
};
