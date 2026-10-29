import JSZip from 'jszip';

export interface StandaloneFiles {
  indexHtml: string;
  gameJs: string;
  styleCss: string;
  privacyHtml: string;
  readmeMd: string;
  adsTxt: string;
}

export async function downloadProjectZip(files: StandaloneFiles, filename = 'roadster-loop-night-run.zip') {
  const zip = new JSZip();
  const folder = zip.folder('roadster-loop') || zip;

  folder.file('index.html', files.indexHtml);
  folder.file('game.js', files.gameJs);
  folder.file('style.css', files.styleCss);
  folder.file('privacy.html', files.privacyHtml);
  folder.file('README.md', files.readmeMd);
  folder.file('ads.txt', files.adsTxt);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
