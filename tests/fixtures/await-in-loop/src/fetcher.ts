export async function fetchSequentially(urls: string[]) {
  const responses = [];
  for (const url of urls) {
    const response = await fetch(url);
    responses.push(await response.json());
  }
  return responses;
}

export async function loadFiles(paths: string[]) {
  const contents = [];
  for (const filePath of paths) {
    const data = await Promise.resolve(filePath);
    contents.push(data);
  }
  return contents;
}
