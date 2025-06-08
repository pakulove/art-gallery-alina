// Add event listeners when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".toggle-form").forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      toggleForms();
    });
  });
});

function onRegisterSuccess(event) {
  if (
    event.detail.xhr &&
    event.detail.xhr.responseText.includes("Регистрация успешна")
  ) {
    toggleForms();
    document.getElementById("register-first-name").value = "";
    document.getElementById("register-last-name").value = "";
    document.getElementById("register-email").value = "";
    document.getElementById("register-password").value = "";
    document.getElementById("register-phone").value = "";
    document.getElementById("auth-message").className = "success";
  }
}

function onLoginSuccess(event) {
  alert("Login response: " + event.detail.xhr.responseText);

  if (
    event.detail.xhr &&
    event.detail.xhr.responseText.includes("Вход выполнен успешно")
  ) {
    const messageDiv = document.getElementById("auth-message");
    messageDiv.innerHTML = event.detail.xhr.responseText;
    messageDiv.className = "success";

    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  } else {
    const messageDiv = document.getElementById("auth-message");
    messageDiv.innerHTML = event.detail.xhr.responseText;
    messageDiv.className = "error";
  }
}

// Функция для проверки авторизации
async function checkAuth() {
  try {
    const response = await fetch("/api/auth/check", {
      credentials: "include",
    });
    const data = await response.json();
    return data.authenticated;
  } catch (error) {
    console.error("Auth check error:", error);
    return false;
  }
}

// Функция для обновления UI в зависимости от авторизации
async function updateAuthUI() {
  const isAuthenticated = await checkAuth();

  // Обновляем хедер
  const loginLink = document.getElementById("login-link");
  const profileLink = document.getElementById("profile-link");
  if (loginLink && profileLink) {
    loginLink.style.display = isAuthenticated ? "none" : "block";
    profileLink.style.display = isAuthenticated ? "block" : "none";
  }

  // Обновляем форму отзыва
  const reviewForm = document.getElementById("review-form-container");
  const authRequired = document.getElementById("auth-required");
  if (reviewForm && authRequired) {
    reviewForm.style.display = isAuthenticated ? "block" : "none";
    authRequired.style.display = isAuthenticated ? "none" : "block";
  }
}

// Проверяем авторизацию при загрузке страницы
document.addEventListener("DOMContentLoaded", updateAuthUI);
