// iTunes artwork URLs contain their size (…/100x100bb.jpg);
export const resizeArtwork = (url: string, size = 600) => url.replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
