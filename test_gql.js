const q = `query($showId: String!) {
  show(_id: $showId) {
    _id
    name
    englishName
    description
    score
    thumbnail
    type
    status
    studios
    genres
  }
}`;
const v = {showId: 'vkD8H5e7HsG2jctw9'}; // Boruto

fetch('https://api.allanime.day/api', {
  method: 'POST',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Referer': 'https://allmanga.to',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({variables: v, query: q})
})
.then(r => r.json())
.then(d => {
  const show = d.data.show;
  if(show.description) show.description = show.description.substring(0, 100) + '...';
  console.log(JSON.stringify(d, null, 2));
})
.catch(e => console.error(e));
