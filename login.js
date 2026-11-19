// EshyBrand LMS - login script

const SUPABASE_URL = 'https://pjytyuhpubzuxbftuyqz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jgggDCLJA5EjSkhjnJ7hBQ_rr5nolsm';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_ID_TRIES = 3;

const form = document.getElementById('loginForm');
const msg = document.getElementById('msg');
const btn = document.getElementById('submitBtn');

const verifyForm = document.getElementById('verifyForm');
const vmsg = document.getElementById('vmsg');
const vbtn = document.getElementById('verifyBtn');
const idInput = document.getElementById('idNumber');
const extras = document.getElementById('extras');
const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');

let idTries = 0;

function showMsg(text, type) {
  msg.textContent = text;
  msg.className = type;
}
function showVMsg(text, type) {
  vmsg.textContent = text;
  vmsg.className = type;
}

function showLogin() {
  verifyForm.style.display = 'none';
  form.style.display = 'block';
  extras.style.display = 'block';
  title.textContent = 'Welcome back';
  subtitle.textContent = 'Login to EshyBrand LMS';
}

function showVerify() {
  form.style.display = 'none';
  extras.style.display = 'none';
  verifyForm.style.display = 'block';
  title.textContent = 'Verify your ID';
  subtitle.textContent = 'One more step before you continue';
  showVMsg('', '');
  idInput.focus();
}

// Learners go to their dashboard (after their ID is verified).
// Admins must use the separate admin login.
async function goHome(userId, freshLogin) {
  const { data } = await sb.from('profiles').select('role').eq('id', userId).single();
  if (data && data.role === 'admin') {
    if (!freshLogin) return (window.location.href = 'admin.html');
    await sb.auth.signOut();
    btn.disabled = false;
    return showMsg('This is the learner login. Administrators please use the Admin login page.', 'err');
  }

  // Learner: has the ID number been verified yet?
  const { data: verified } = await sb.rpc('my_id_verified');
  if (verified) return (window.location.href = 'dashboard.html');

  btn.disabled = false;
  showVerify();
}

// If already logged in, go straight to the right place
sb.auth.getSession().then(({ data }) => {
  if (data.session) goHome(data.session.user.id, false);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  btn.disabled = true;
  showMsg('Logging in...', '');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    btn.disabled = false;
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return showMsg('Please confirm your email first (check your inbox), then log in.', 'err');
    }
    return showMsg('Incorrect email or password.', 'err');
  }

  showMsg('Login successful! Redirecting...', 'ok');
  goHome(data.user.id, true);
});

// ID verification: the ID must be on the list the administrator loaded
verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = idInput.value.replace(/\s+/g, '');
  if (!id) return showVMsg('Please enter your ID number.', 'err');

  vbtn.disabled = true;
  showVMsg('Checking...', '');

  const { data: ok, error } = await sb.rpc('verify_my_id', { p_id: id });

  if (error) {
    vbtn.disabled = false;
    return showVMsg('Something went wrong. Please try again.', 'err');
  }

  if (ok) {
    showVMsg('ID verified! Redirecting...', 'ok');
    return (window.location.href = 'dashboard.html');
  }

  // Rejected
  idTries++;
  vbtn.disabled = false;
  if (idTries >= MAX_ID_TRIES) {
    await sb.auth.signOut();
    idTries = 0;
    idInput.value = '';
    btn.disabled = false;
    showLogin();
    return showMsg('Your ID number was not found on the programme list, or has already been used. Please contact your administrator.', 'err');
  }
  showVMsg('This ID number is not on the programme list, or has already been used. Attempts left: ' + (MAX_ID_TRIES - idTries) + '.', 'err');
});

document.getElementById('cancelVerify').addEventListener('click', async () => {
  await sb.auth.signOut();
  idTries = 0;
  idInput.value = '';
  btn.disabled = false;
  showMsg('', '');
  showLogin();
});

// Forgot password: sends a reset link to the email typed in the box
document.getElementById('forgotLink').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  if (!email) return showMsg('Type your email address above first, then click "Forgot your password?".', 'err');

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });

  if (error) return showMsg(error.message, 'err');
  showMsg('A password reset link has been sent to your email.', 'ok');
});