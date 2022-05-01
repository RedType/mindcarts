export const expectEnv = (key: string) => {
  if (!process.env[key])
    throw new Error(`Environment variable ${key} must be set`);
  else
    return process.env[key];
};

