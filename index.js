// EshyBrand LMS - homepage script

const SUPABASE_URL = 'https://pjytyuhpubzuxbftuyqz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jgggDCLJA5EjSkhjnJ7hBQ_rr5nolsm';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('year').textContent = new Date().getFullYear();

// If logged in, show a Dashboard button (admin or learner) and Logout
async function updateNav() {
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return;

    const { data: profile } = await sb.from('profiles').select('role').eq('id', data.session.user.id).single();
    const isAdmin = profile && profile.role === 'admin';
    const url = isAdmin ? 'admin.html' : 'dashboard.html';

    document.getElementById('navLinks').innerHTML =
      '<a class="btn fill" href="' + url + '">' + (isAdmin ? 'Admin Dashboard' : 'My Dashboard') + '</a>' +
      '<button class="btn" id="logoutBtn">Logout</button>';

    document.getElementById('heroButtons').innerHTML =
      '<a class="btn fill" href="' + url + '">Go to my dashboard</a>';

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await sb.auth.signOut();
      window.location.reload();
    });
  } catch (err) {
    console.error('Could not check login status:', err);
  }
}

updateNav();