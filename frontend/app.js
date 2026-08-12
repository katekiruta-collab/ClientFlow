// ============================================================
// ClientFlow - FULL APP.JS
// PostgreSQL API VERSION
// NO localStorage
// ============================================================

const telegramApp = window.Telegram?.WebApp || null;

// ============================================================
// API
// ============================================================

const API_BASE = "https://clientflow-production-59b4.up.railway.app/api";

let telegramInitData = "";
let clientFlowData = {
    clients: [],
    appointments: [],
    invoices: []
};

let currentUser = null;

// ============================================================
// Telegram Mini App Setup
// ============================================================

if (telegramApp) {
    telegramApp.ready();
    telegramApp.expand();
    telegramApp.disableVerticalSwipes?.();

    function setViewportHeight() {
        const height =
            telegramApp.viewportStableHeight ||
            telegramApp.viewportHeight ||
            window.innerHeight;

        document.documentElement.style.setProperty(
            "--tg-viewport-stable-height",
            `${height}px`
        );

        document.documentElement.style.setProperty(
            "--app-height",
            `${height}px`
        );
    }

    setViewportHeight();

    telegramApp.onEvent("viewportChanged", setViewportHeight);
    window.addEventListener("resize", setViewportHeight);

    telegramInitData = telegramApp.initData || "";

    const telegramUser = telegramApp.initDataUnsafe?.user;

    if (telegramUser) {
        const userName = telegramUser.first_name || "Специалист";

        const greeting = document.querySelector(".greeting");
        if (greeting) {
            greeting.textContent = `Добрый день, ${userName} 👋`;
        }

        const avatar = document.querySelector(".avatar");
        if (avatar) {
            avatar.textContent = userName.charAt(0).toUpperCase();
        }
    }

    window.haptic = function (type = "light") {
        if (telegramApp.HapticFeedback?.impactOccurred) {
            telegramApp.HapticFeedback.impactOccurred(type);
        }
    };
} else {
    window.haptic = function () {};
    console.warn("Telegram WebApp is not available.");
}

// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(endpoint, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (telegramInitData) {
        headers["X-Telegram-Init-Data"] = telegramInitData;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    let data = null;

    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const message = data?.message || `HTTP ${response.status}`;
        throw new Error(message);
    }

    return data;
}

// ============================================================
// AUTHENTICATION
// ============================================================

async function authenticate() {
    if (!telegramInitData) {
        throw new Error(
            "Telegram initData отсутствует. Откройте ClientFlow через Telegram."
        );
    }

    const result = await apiRequest("/auth", {
        method: "POST",
        body: JSON.stringify({
            initData: telegramInitData
        })
    });

    if (!result.success) {
        throw new Error(result.message || "Ошибка авторизации");
    }

    currentUser = result.databaseUser || result.user || null;
    return result;
}

// ============================================================
// LOAD ALL DATA
// ============================================================

async function loadClients() {
    const result = await apiRequest("/clients");
    clientFlowData.clients = Array.isArray(result.clients)
        ? result.clients.map(normalizeClient)
        : [];
}

async function loadAppointments() {
    const result = await apiRequest("/appointments");
    clientFlowData.appointments = Array.isArray(result.appointments)
        ? result.appointments.map(normalizeAppointment)
        : [];
}

async function loadInvoices() {
    const result = await apiRequest("/invoices");
    clientFlowData.invoices = Array.isArray(result.invoices)
        ? result.invoices.map(normalizeInvoice)
        : [];
}

async function loadAllData() {
    await Promise.all([
        loadClients(),
        loadAppointments(),
        loadInvoices()
    ]);
    window.clientFlowData = clientFlowData;
}

// ============================================================
// DATA NORMALIZATION
// ============================================================

function normalizeClient(client) {
    return {
        id: Number(client.id),
        name: client.name || "",
        phone: client.phone || "",
        email: client.email || "",
        notes: client.notes || "",
        visits: Number(client.visits || 0),
        total: Number(client.total || 0),
        status: client.status || "Новый клиент",
        archived: Boolean(client.archived)
    };
}

function normalizeAppointment(appointment) {
    return {
        id: Number(appointment.id),
        clientId:
            appointment.client_id !== null && appointment.client_id !== undefined
                ? Number(appointment.client_id)
                : null,
        client: appointment.client_name || "",
        time: appointment.time ? String(appointment.time).slice(0, 5) : "",
        date: appointment.date
            ? String(appointment.date).slice(0, 10)
            : getTodayDate(),
        service: appointment.service || "",
        price: Number(appointment.price || 0),
        status: normalizeAppointmentStatus(appointment.status),
        archived:
            appointment.status === "paid" ||
            appointment.status === "Оплачено" ||
            Boolean(appointment.archived),
        notes: appointment.notes || ""
    };
}

function normalizeInvoice(invoice) {
    const dueDate = invoice.due_date ? String(invoice.due_date).slice(0, 10) : null;
    return {
        id: Number(invoice.id),
        clientId:
            invoice.client_id !== null && invoice.client_id !== undefined
                ? Number(invoice.client_id)
                : null,
        client: invoice.client_name || "",
        appointmentId:
            invoice.appointment_id !== null && invoice.appointment_id !== undefined
                ? Number(invoice.appointment_id)
                : null,
        amount: Number(invoice.amount || 0),
        status: normalizeInvoiceStatus(invoice.status),
        dueDate: dueDate,
        paidAt: invoice.paid_at || null,
        date: dueDate,
        notes: invoice.notes || ""
    };
}

function normalizeAppointmentStatus(status) {
    if (status === "paid" || status === "Оплачено") {
        return "Оплачено";
    }
    return "Ожидает оплаты";
}

function normalizeInvoiceStatus(status) {
    if (status === "paid" || status === "Оплачено") {
        return "Оплачено";
    }
    return "Не оплачено";
}

// ============================================================
// DATE / FORMAT HELPERS
// ============================================================

function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
    if (!dateString) return "";
    const parts = String(dateString).split("-");
    if (parts.length !== 3) return dateString;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function getMonthName(year, month) {
    return new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric"
    }).format(new Date(year, month, 1));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// ============================================================
// FIND HELPERS
// ============================================================

function findClient(id) {
    return clientFlowData.clients.find(
        client => Number(client.id) === Number(id)
    );
}

function findAppointment(id) {
    return clientFlowData.appointments.find(
        appointment => Number(appointment.id) === Number(id)
    );
}

function findInvoice(id) {
    return clientFlowData.invoices.find(
        invoice => Number(invoice.id) === Number(id)
    );
}

function findInvoiceForAppointment(appointmentId) {
    return clientFlowData.invoices.find(
        invoice => Number(invoice.appointmentId) === Number(appointmentId)
    );
}

// ============================================================
// UI NAVIGATION
// ============================================================

function openScreen(screenName) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const target = document.getElementById(`${screenName}-screen`);
    if (target) {
        target.classList.add("active");
    }

    document.querySelectorAll(".nav-btn").forEach(button => {
        button.classList.remove("active");
        if (button.dataset.screen === screenName) {
            button.classList.add("active");
        }
    });

    if (screenName === "dashboard") renderDashboard();
    if (screenName === "clients") renderClients();
    if (screenName === "appointments") {
        renderCalendar();
        renderAppointments();
    }
    if (screenName === "invoices") renderInvoices();
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
    const todayCard = document.querySelector(".today-card");
    if (!todayCard) return;

    const appointments = clientFlowData.appointments || [];
    const todayAppointments = appointments.filter(
        appointment => appointment.date === getTodayDate()
    );

    const appointmentCount = todayAppointments.length;
    const expectedIncome = todayAppointments.reduce(
        (sum, appointment) => sum + Number(appointment.price || 0),
        0
    );
    const actualIncome = todayAppointments
        .filter(appointment => appointment.status === "Оплачено")
        .reduce((sum, appointment) => sum + Number(appointment.price || 0), 0);

    const stats = todayCard.querySelectorAll(".stat strong");
    if (stats[0]) stats[0].textContent = appointmentCount;
    if (stats[1]) stats[1].textContent = `${expectedIncome} €`;
    if (stats[2]) stats[2].textContent = `${actualIncome} €`;

    const nextCard = document.querySelector(".next-card");
    if (!nextCard) return;

    const activeToday = todayAppointments
        .filter(appointment => appointment.status !== "Оплачено")
        .sort((a, b) =>
            String(a.time || "").localeCompare(String(b.time || ""))
        );

    const nextAppointment = activeToday.length > 0 ? activeToday[0] : null;

    if (!nextAppointment) {
        nextCard.innerHTML = `
            <p class="label">Сегодня</p>
            <div class="empty-dashboard">Нет предстоящих записей</div>
        `;
        return;
    }

    nextCard.innerHTML = `
        <p class="label">Следующая запись</p>
        <div class="appointment">
            <div>
                <h2>${escapeHtml(nextAppointment.time || "")}</h2>
                <p>${escapeHtml(nextAppointment.client || "")}</p>
            </div>
            <div class="service">
                ${escapeHtml(nextAppointment.service || "")}<br>
                <strong>${Number(nextAppointment.price || 0)} €</strong>
            </div>
        </div>
        <button class="primary-btn" type="button" data-dashboard-open="appointments">
            Открыть записи
        </button>
    `;

    nextCard
        .querySelector("[data-dashboard-open]")
        ?.addEventListener("click", () => openScreen("appointments"));
}

// ============================================================
// CLIENTS
// ============================================================

function renderClients() {
    const container = document.querySelector("#clients-screen .list");
    if (!container) return;

    container.innerHTML = "";

    const activeClients = clientFlowData.clients.filter(client => !client.archived);
    const archivedClients = clientFlowData.clients.filter(client => client.archived);

    if (activeClients.length === 0) {
        container.innerHTML = `<div class="empty-state">Клиентов пока нет</div>`;
    } else {
        activeClients.forEach(client =>
            container.appendChild(createClientCard(client, false))
        );
    }

    if (archivedClients.length > 0) {
        const title = document.createElement("h3");
        title.className = "section-subtitle";
        title.textContent = "Архив";
        container.appendChild(title);

        archivedClients.forEach(client =>
            container.appendChild(createClientCard(client, true))
        );
    }
}

function createClientCard(client, archived) {
    const card = document.createElement("div");
    card.className = "client-card";
    if (archived) card.classList.add("archived-card");

    card.innerHTML = `
        <div class="card-main">
            <h3>${escapeHtml(client.name)}</h3>
            <p>📞 ${escapeHtml(client.phone || "")}</p>
            <span class="client-status">${escapeHtml(client.status || "")}</span>
            <div class="card-actions">
                <button class="small-btn edit-btn" type="button" data-action="edit-client" data-id="${client.id}">
                    Редактировать
                </button>
                ${
                    archived
                        ? `
                        <button class="small-btn restore-btn" type="button" data-action="restore-client" data-id="${client.id}">
                            Вернуть
                        </button>`
                        : `
                        <button class="small-btn archive-btn" type="button" data-action="archive-client" data-id="${client.id}">
                            В архив
                        </button>`
                }
                <button class="small-btn danger-btn" type="button" data-action="delete-client" data-id="${client.id}">
                    Удалить
                </button>
            </div>
        </div>
    `;
    return card;
}

// ============================================================
// CALENDAR
// ============================================================

const today = new Date();
let calendarYear = today.getFullYear();
let calendarMonth = today.getMonth();
let selectedDate = getTodayDate();

function renderCalendar() {
    const calendar = document.getElementById("appointments-calendar");
    if (!calendar) return;

    const title = document.getElementById("calendar-month-title");
    if (title) title.textContent = getMonthName(calendarYear, calendarMonth);

    const grid = document.getElementById("calendar-grid");
    if (!grid) return;

    grid.innerHTML = "";

    const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    weekdays.forEach(day => {
        const header = document.createElement("div");
        header.className = "calendar-weekday";
        header.textContent = day;
        grid.appendChild(header);
    });

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const appointments = clientFlowData.appointments || [];

    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement("div");
        empty.className = "calendar-day empty";
        grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayButton = document.createElement("button");
        dayButton.type = "button";
        dayButton.className = "calendar-day";

        if (dateString === getTodayDate()) dayButton.classList.add("today");
        if (dateString === selectedDate) dayButton.classList.add("selected");

        const dayAppointments = appointments.filter(
            appointment => appointment.date === dateString
        );
        const unpaidCount = dayAppointments.filter(
            appointment => appointment.status !== "Оплачено"
        ).length;

        dayButton.innerHTML = `
            <span class="calendar-day-number">${day}</span>
            ${
                dayAppointments.length > 0
                    ? `<span class="calendar-dots">${dayAppointments
                          .slice(0, 3)
                          .map(() => "<i></i>")
                          .join("")}</span>`
                    : ""
            }
            ${
                unpaidCount > 0
                    ? `<span class="calendar-count">${unpaidCount}</span>`
                    : ""
            }
        `;

        dayButton.addEventListener("click", () => {
            selectedDate = dateString;
            window.haptic("light");
            renderCalendar();
            renderAppointments();
        });

        grid.appendChild(dayButton);
    }
}

function changeCalendarMonth(direction) {
    calendarMonth += direction;
    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
    }
    if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
    }
    selectedDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-01`;
    renderCalendar();
    renderAppointments();
}

// ============================================================
// APPOINTMENTS
// ============================================================

function renderAppointments() {
    const container = document.querySelector("#appointments-screen .list");
    if (!container) return;

    container.innerHTML = "";

    const appointments = (clientFlowData.appointments || [])
        .filter(appointment => appointment.date === selectedDate)
        .sort((a, b) => {
            const aPaid = a.status === "Оплачено";
            const bPaid = b.status === "Оплачено";
            if (aPaid !== bPaid) return aPaid ? 1 : -1;
            return String(a.time || "").localeCompare(String(b.time || ""));
        });

    const selectedTitle = document.getElementById("selected-date-title");
    if (selectedTitle) {
        selectedTitle.textContent =
            selectedDate === getTodayDate() ? "Сегодня" : formatDate(selectedDate);
    }

    if (appointments.length === 0) {
        container.innerHTML = `<div class="empty-state">На этот день записей нет</div>`;
        return;
    }

    appointments.forEach(item => {
        const card = document.createElement("div");
        card.className = "appointment-card";
        const paid = item.status === "Оплачено";
        if (paid) card.classList.add("appointment-completed");

        const invoice = findInvoiceForAppointment(item.id);

        card.innerHTML = `
            <div class="appointment-time">${escapeHtml(item.time || "--:--")}</div>
            <div class="appointment-info">
                <h3>${escapeHtml(item.client || "")}</h3>
                <p>
                    ${escapeHtml(item.service || "")} · ${Number(item.price || 0)} €
                </p>
                <span class="appointment-status ${paid ? "appointment-paid" : ""}">
                    ${paid ? "Оплачено" : "Ожидает оплаты"}
                </span>
                <div class="card-actions">
                    <button class="small-btn ${paid ? "invoice-status-btn" : "pay-btn"}" type="button" data-action="pay-appointment" data-id="${item.id}">
                        ${paid ? "Отменить оплату" : "Оплата"}
                    </button>
                    <button class="small-btn edit-btn" type="button" data-action="edit-appointment" data-id="${item.id}">
                        Редактировать
                    </button>
                    ${invoice ? `<span class="invoice-link-note">Счёт #${invoice.id}</span>` : ""}
                    <button class="small-btn danger-btn" type="button" data-action="delete-appointment" data-id="${item.id}">
                        Удалить
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ============================================================
// CLIENTS CRUD
// ============================================================

async function createClient(name, phone) {
    const result = await apiRequest("/clients", {
        method: "POST",
        body: JSON.stringify({ name, phone })
    });
    const client = normalizeClient(result.client);
    clientFlowData.clients.push(client);
    return client;
}

async function updateClient(id, name, phone) {
    const result = await apiRequest(`/clients/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, phone })
    });
    const updated = normalizeClient(result.client);
    const index = clientFlowData.clients.findIndex(
        client => Number(client.id) === Number(id)
    );
    if (index !== -1) clientFlowData.clients[index] = updated;
    return updated;
}

function archiveClient(id) {
    const client = findClient(id);
    if (!client) return;
    client.archived = true;
    renderClients();
    renderDashboard();
}

function restoreClient(id) {
    const client = findClient(id);
    if (!client) return;
    client.archived = false;
    renderClients();
    renderDashboard();
}

async function deleteClient(id) {
    await apiRequest(`/clients/${id}`, { method: "DELETE" });

    clientFlowData.clients = clientFlowData.clients.filter(
        client => Number(client.id) !== Number(id)
    );
    clientFlowData.appointments = clientFlowData.appointments.filter(
        appointment => Number(appointment.clientId) !== Number(id)
    );
    clientFlowData.invoices = clientFlowData.invoices.filter(
        invoice => Number(invoice.clientId) !== Number(id)
    );

    renderClients();
    renderAppointments();
    renderInvoices();
    renderDashboard();
}

// ============================================================
// CLIENT FORMS
// ============================================================

function openClientForm() {
    openModal(`
        <h2>Новый клиент</h2>
        <input id="client-name" type="text" placeholder="Имя">
        <input id="client-phone" type="tel" placeholder="Телефон">
        <button class="primary-btn" id="save-client" type="button">Сохранить</button>
    `);

    document.getElementById("save-client").addEventListener("click", async function () {
        const name = document.getElementById("client-name").value.trim();
        const phone = document.getElementById("client-phone").value.trim();

        if (!name) {
            document.getElementById("client-name").focus();
            return;
        }

        try {
            await createClient(name, phone);
            renderClients();
            renderDashboard();
            closeModal();
            window.haptic("light");
        } catch (error) {
            showError(error.message);
        }
    });
}

function openClientEditForm(id) {
    const client = findClient(id);
    if (!client) return;

    openModal(`
        <h2>Редактировать клиента</h2>
        <input id="edit-client-name" type="text" value="${escapeHtml(client.name)}" placeholder="Имя">
        <input id="edit-client-phone" type="tel" value="${escapeHtml(client.phone || "")}" placeholder="Телефон">
        <button class="primary-btn" id="update-client" type="button">Сохранить изменения</button>
    `);

    document.getElementById("update-client").addEventListener("click", async function () {
        const name = document.getElementById("edit-client-name").value.trim();
        const phone = document.getElementById("edit-client-phone").value.trim();

        if (!name) return;

        try {
            await updateClient(id, name, phone);

            clientFlowData.appointments
                .filter(appointment => Number(appointment.clientId) === Number(id))
                .forEach(appointment => {
                    appointment.client = name;
                });

            clientFlowData.invoices
                .filter(invoice => Number(invoice.clientId) === Number(id))
                .forEach(invoice => {
                    invoice.client = name;
                });

            renderClients();
            renderAppointments();
            renderInvoices();
            renderDashboard();
            closeModal();
            window.haptic("light");
        } catch (error) {
            showError(error.message);
        }
    });
}

// ============================================================
// APPOINTMENTS CRUD
// ============================================================

async function createAppointment(clientId, date, time, price, notes, service) {
    const result = await apiRequest("/appointments", {
        method: "POST",
        body: JSON.stringify({
            client_id: clientId || null,
            date,
            time: time || null,
            status: "planned",
            price: Number(price) || 0,
            notes: notes || null,
            service: service || null
        })
    });

    const created = normalizeAppointment(result.appointment);
    const client = clientId ? findClient(clientId) : null;
    if (client) created.client = client.name;

    clientFlowData.appointments.push(created);
    return created;
}

async function updateAppointment(id, clientId, date, time, price, notes, status, service) {
    const result = await apiRequest(`/appointments/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            client_id: clientId || null,
            date,
            time: time || null,
            status: status === "Оплачено" ? "paid" : "planned",
            price: Number(price) || 0,
            notes: notes || null,
            service: service || null
        })
    });

    const updated = normalizeAppointment(result.appointment);
    const client = clientId ? findClient(clientId) : null;
    if (client) updated.client = client.name;

    const index = clientFlowData.appointments.findIndex(
        appointment => Number(appointment.id) === Number(id)
    );
    if (index !== -1) clientFlowData.appointments[index] = updated;

    return updated;
}

function openAppointmentForm() {
    const clientOptions = clientFlowData.clients
        .filter(client => !client.archived)
        .map(
            client =>
                `<option value="${client.id}">${escapeHtml(client.name)}</option>`
        )
        .join("");

    openModal(`
        <h2>Новая запись</h2>
        <select id="appointment-client">
            <option value="">Выберите клиента</option>
            ${clientOptions}
        </select>
        <input id="appointment-service" type="text" placeholder="Услуга">
        <input id="appointment-date" type="date" value="${selectedDate}">
        <input id="appointment-time" type="time">
        <input id="appointment-price" type="number" min="0" placeholder="Цена">
        <button class="primary-btn" id="save-appointment" type="button">Создать запись</button>
    `);

    document.getElementById("save-appointment").addEventListener("click", async function () {
        const clientId = Number(document.getElementById("appointment-client").value) || null;
        const service = document.getElementById("appointment-service").value.trim();
        const date = document.getElementById("appointment-date").value || getTodayDate();
        const time = document.getElementById("appointment-time").value;
        const price = Number(document.getElementById("appointment-price").value) || 0;

        if (!clientId) {
            document.getElementById("appointment-client").focus();
            return;
        }

        try {
            await createAppointment(clientId, date, time, price, null, service);
            selectedDate = date;

            const createdDate = new Date(`${date}T12:00:00`);
            calendarYear = createdDate.getFullYear();
            calendarMonth = createdDate.getMonth();

            renderCalendar();
            renderAppointments();
            renderDashboard();
            closeModal();
            window.haptic("light");
        } catch (error) {
            showError(error.message);
        }
    });
}

function openAppointmentEditForm(id) {
    const appointment = findAppointment(id);
    if (!appointment) return;

    const clientOptions = clientFlowData.clients
        .filter(
            client =>
                !client.archived || Number(client.id) === Number(appointment.clientId)
        )
        .map(
            client => `
                <option value="${client.id}" ${
                Number(client.id) === Number(appointment.clientId) ? "selected" : ""
            }>
                    ${escapeHtml(client.name)}
                </option>
            `
        )
        .join("");

    openModal(`
        <h2>Редактировать запись</h2>
        <select id="edit-appointment-client">
            <option value="">Выберите клиента</option>
            ${clientOptions}
        </select>
        <input id="edit-appointment-service" type="text" value="${escapeHtml(appointment.service || "")}" placeholder="Услуга">
        <input id="edit-appointment-date" type="date" value="${escapeHtml(appointment.date || getTodayDate())}">
        <input id="edit-appointment-time" type="time" value="${escapeHtml(appointment.time || "")}">
        <input id="edit-appointment-price" type="number" min="0" value="${Number(appointment.price) || 0}" placeholder="Цена">
        <button class="primary-btn" id="update-appointment" type="button">Сохранить изменения</button>
    `);

    document.getElementById("update-appointment").addEventListener("click", async function () {
        const clientId = Number(document.getElementById("edit-appointment-client").value) || null;
        const service = document.getElementById("edit-appointment-service").value.trim();
        const date = document.getElementById("edit-appointment-date").value || getTodayDate();
        const time = document.getElementById("edit-appointment-time").value;
        const price = Number(document.getElementById("edit-appointment-price").value) || 0;

        if (!clientId) return;

        const oldDate = appointment.date;

        try {
            await updateAppointment(
                id, clientId, date, time, price,
                appointment.notes, appointment.status, service
            );

            const invoice = findInvoiceForAppointment(id);

            if (invoice) {
                invoice.clientId = clientId;
                const client = findClient(clientId);
                invoice.client = client ? client.name : "";
                invoice.amount = price;
                invoice.date = date;
                invoice.dueDate = date;

                // Сохраняем изменения связанного счета на сервере
                await updateInvoice(invoice.id, {
                    clientId: clientId,
                    appointmentId: invoice.appointmentId,
                    amount: price,
                    status: invoice.status,
                    dueDate: date,
                    paidAt: invoice.paidAt,
                    notes: invoice.notes
                });
            }

            if (oldDate !== date) {
                selectedDate = date;
                const newDate = new Date(`${date}T12:00:00`);
                calendarYear = newDate.getFullYear();
                calendarMonth = newDate.getMonth();
            }

            renderCalendar();
            renderAppointments();
            renderInvoices();
            renderDashboard();
            closeModal();
            window.haptic("light");
        } catch (error) {
            showError(error.message);
        }
    });
}

async function deleteAppointment(id) {
    await apiRequest(`/appointments/${id}`, { method: "DELETE" });

    clientFlowData.appointments = clientFlowData.appointments.filter(
        appointment => Number(appointment.id) !== Number(id)
    );

    clientFlowData.invoices.forEach(invoice => {
        if (Number(invoice.appointmentId) === Number(id)) {
            invoice.appointmentId = null;
        }
    });

    renderCalendar();
    renderAppointments();
    renderInvoices();
    renderDashboard();
}

async function payAppointment(id) {
    const appointment = findAppointment(id);
    if (!appointment) return;

    const existingInvoice = findInvoiceForAppointment(appointment.id);

    try {
        if (appointment.status === "Оплачено") {
            await updateAppointment(
                appointment.id, appointment.clientId, appointment.date, appointment.time,
                appointment.price, appointment.notes, "Ожидает оплаты", appointment.service
            );

            if (existingInvoice) {
                await updateInvoice(existingInvoice.id, {
                    clientId: existingInvoice.clientId,
                    appointmentId: existingInvoice.appointmentId,
                    amount: existingInvoice.amount,
                    status: "Не оплачено",
                    dueDate: existingInvoice.dueDate,
                    paidAt: null,
                    notes: existingInvoice.notes
                });
            }
        } else {
            if (!existingInvoice) {
                const result = await apiRequest("/invoices", {
                    method: "POST",
                    body: JSON.stringify({
                        client_id: appointment.clientId,
                        appointment_id: appointment.id,
                        amount: Number(appointment.price || 0),
                        status: "paid",
                        due_date: appointment.date,
                        notes: null
                    })
                });

                const invoice = normalizeInvoice(result.invoice);
                invoice.client = appointment.client;
                clientFlowData.invoices.push(invoice);
            } else {
                await updateInvoice(existingInvoice.id, {
                    clientId: appointment.clientId,
                    appointmentId: appointment.id,
                    amount: appointment.price,
                    status: "Оплачено",
                    dueDate: appointment.date,
                    paidAt: new Date().toISOString(),
                    notes: existingInvoice.notes
                });
            }

            await updateAppointment(
                appointment.id, appointment.clientId, appointment.date, appointment.time,
                appointment.price, appointment.notes, "Оплачено", appointment.service
            );
        }

        renderAppointments();
        renderInvoices();
        renderDashboard();
        window.haptic("light");
    } catch (error) {
        showError(error.message);
    }
}

// ============================================================
// INVOICES CRUD
// ============================================================

async function updateInvoice(id, data) {
    const result = await apiRequest(`/invoices/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            client_id: data.clientId || null,
            appointment_id: data.appointmentId || null,
            amount: Number(data.amount || 0),
            status: data.status === "Оплачено" ? "paid" : "unpaid",
            due_date: data.dueDate || null,
            paid_at: data.paidAt || null,
            notes: data.notes || null
        })
    });

    const updated = normalizeInvoice(result.invoice);
    const client = data.clientId ? findClient(data.clientId) : null;
    if (client) updated.client = client.name;

    const index = clientFlowData.invoices.findIndex(
        invoice => Number(invoice.id) === Number(id)
    );
    if (index !== -1) clientFlowData.invoices[index] = updated;

    return updated;
}

function renderInvoices() {
    const container = document.querySelector("#invoices-screen .list");
    if (!container) return;

    container.innerHTML = "";

    const invoices = (clientFlowData.invoices || []).slice().sort((a, b) => {
        const aPaid = a.status === "Оплачено";
        const bPaid = b.status === "Оплачено";
        if (aPaid !== bPaid) return aPaid ? 1 : -1;
        return Number(b.id) - Number(a.id);
    });

    if (invoices.length === 0) {
        container.innerHTML = `<div class="empty-state">Счетов пока нет</div>`;
        return;
    }

    invoices.forEach(invoice => {
        const card = document.createElement("div");
        card.className = "invoice-card";
        const paid = invoice.status === "Оплачено";
        if (paid) card.classList.add("invoice-completed");

        card.innerHTML = `
            <div class="invoice-main">
                <div class="invoice-top">
                    <div>
                        <h3>Счёт #${invoice.id}</h3>
                        <p>${escapeHtml(invoice.client || "")}</p>
                    </div>
                    <strong>${Number(invoice.amount || 0)} €</strong>
                </div>
                <span class="invoice-status ${paid ? "paid" : "unpaid"}">
                    ${paid ? "Оплачено" : "Не оплачено"}
                </span>
                ${
                    invoice.date
                        ? `<div class="invoice-date">${formatDate(invoice.date)}</div>`
                        : ""
                }
                <div class="card-actions">
                    <button class="small-btn edit-btn" type="button" data-action="edit-invoice" data-id="${invoice.id}">
                        Редактировать
                    </button>
                    <button class="small-btn invoice-status-btn" type="button" data-action="toggle-invoice" data-id="${invoice.id}">
                        ${paid ? "Отменить оплату" : "Оплатить"}
                    </button>
                    <button class="small-btn danger-btn" type="button" data-action="delete-invoice" data-id="${invoice.id}">
                        Удалить
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

async function createInvoice(clientId, amount) {
    const result = await apiRequest("/invoices", {
        method: "POST",
        body: JSON.stringify({
            client_id: clientId || null,
            appointment_id: null,
            amount: Number(amount),
            status: "unpaid",
            due_date: getTodayDate(),
            notes: null
        })
    });

    const invoice = normalizeInvoice(result.invoice);
    const client = clientId ? findClient(clientId) : null;
    if (client) invoice.client = client.name;

    clientFlowData.invoices.push(invoice);
    return invoice;
}

function openInvoiceForm() {
    const clientOptions = clientFlowData.clients
        .filter(client => !client.archived)
        .map(
            client =>
                `<option value="${client.id}">${escapeHtml(client.name)}</option>`
        )
        .join("");

    openModal(`
        <h2>Новый счёт</h2>
        <select id="invoice-client">
            <option value="">Выберите клиента</option>
            ${clientOptions}
        </select>
        <input id="invoice-amount" type="number" min="0" placeholder="Сумма">
        <button class="primary-btn" id="save-invoice" type="button">Создать счёт</button>
    `);

    document.getElementById("save-invoice").addEventListener("click", async function () {
        const clientId = Number(document.getElementById("invoice-client").value) || null;
        const amount = Number(document.getElementById("invoice-amount").value) || 0;

        if (!clientId) {
            document.getElementById("invoice-client").focus();
            return;
        }
        if (amount <= 0) {
            document.getElementById("invoice-amount").focus();
            return;
        }

        try {
            await createInvoice(clientId, amount);
            renderInvoices();
            renderDashboard();
            closeModal();
            window.haptic("light");
        } catch (error) {
            showError(error.message);
        }
    });
}

function openInvoiceEditForm(id) {
    const invoice = findInvoice(id);
    if (!invoice) return;

    const clientOptions = clientFlowData.clients
        .map(
            client => `
                <option value="${client.id}" ${
                Number(client.id) === Number(invoice.clientId) ? "selected" : ""
            }>
                    ${escapeHtml(client.name)}
                </option>
            `
        )
        .join("");

    openModal(`
        <h2>Редактировать счёт</h2>
        <select id="edit-invoice-client">
            <option value="">Выберите клиента</option>
            ${clientOptions}
        </select>
        <input id="edit-invoice-amount" type="number" min="0" value="${Number(invoice.amount) || 0}" placeholder="Сумма">
        <button class="primary-btn" id="update-invoice" type="button">Сохранить изменения</button>
    `);

    document.getElementById("update-invoice").addEventListener("click", async function () {
        const clientId = Number(document.getElementById("edit-invoice-client").value) || null;
        const amount = Number(document.getElementById("edit-invoice-amount").value) || 0;

        if (!clientId) return;
        if (amount <= 0) return;

        try {
            await updateInvoice(id, {
                clientId,
                appointmentId: invoice.appointmentId,
                amount,
                status: invoice.status,
                dueDate: invoice.dueDate,
                paidAt: invoice.paidAt,
                notes: invoice.notes
            });

            if (invoice.appointmentId) {
                const appointment = findAppointment(invoice.appointmentId);
                if (appointment) {
                    appointment.clientId = clientId;
                    const client = findClient(clientId);
                    appointment.client = client ? client.name : "";
                    appointment.price = amount;

                    await updateAppointment(
                        appointment.id, clientId, appointment.date, appointment.time,
                        amount, appointment.notes, appointment.status, appointment.service
                    );
                }
            }

            renderInvoices();
            renderAppointments();
            renderDashboard();
            closeModal();
            window.haptic("light");
        } catch (error) {
            showError(error.message);
        }
    });
}

async function toggleInvoice(id) {
    const invoice = findInvoice(id);
    if (!invoice) return;

    const appointment = invoice.appointmentId
        ? findAppointment(invoice.appointmentId)
        : null;

    try {
        if (invoice.status === "Оплачено") {
            await updateInvoice(invoice.id, {
                clientId: invoice.clientId,
                appointmentId: invoice.appointmentId,
                amount: invoice.amount,
                status: "Не оплачено",
                dueDate: invoice.dueDate,
                paidAt: null,
                notes: invoice.notes
            });

            if (appointment) {
                await updateAppointment(
                    appointment.id, appointment.clientId, appointment.date, appointment.time,
                    appointment.price, appointment.notes, "Ожидает оплаты", appointment.service
                );
            }
        } else {
            await updateInvoice(invoice.id, {
                clientId: invoice.clientId,
                appointmentId: invoice.appointmentId,
                amount: invoice.amount,
                status: "Оплачено",
                dueDate: invoice.dueDate,
                paidAt: new Date().toISOString(),
                notes: invoice.notes
            });

            if (appointment) {
                await updateAppointment(
                    appointment.id, appointment.clientId, appointment.date, appointment.time,
                    appointment.price, appointment.notes, "Оплачено", appointment.service
                );
            }
        }

        renderInvoices();
        renderAppointments();
        renderDashboard();
        window.haptic("light");
    } catch (error) {
        showError(error.message);
    }
}

async function deleteInvoice(id) {
    const invoice = findInvoice(id);
    if (!invoice) return;

    const appointment = invoice.appointmentId
        ? findAppointment(invoice.appointmentId)
        : null;

    try {
        await apiRequest(`/invoices/${id}`, { method: "DELETE" });

        clientFlowData.invoices = clientFlowData.invoices.filter(
            item => Number(item.id) !== Number(id)
        );

        if (appointment) {
            await updateAppointment(
                appointment.id, appointment.clientId, appointment.date, appointment.time,
                appointment.price, appointment.notes, "Ожидает оплаты", appointment.service
            );
        }

        renderInvoices();
        renderAppointments();
        renderDashboard();
        window.haptic("light");
    } catch (error) {
        showError(error.message);
    }
}

// ============================================================
// MODAL
// ============================================================

function createModal() {
    if (document.getElementById("clientflow-modal")) return;

    const modal = document.createElement("div");
    modal.id = "clientflow-modal";
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-box">
                <button class="modal-close" type="button" aria-label="Закрыть">×</button>
                <div id="modal-content"></div>
            </div>
        </div>
    `;

    const appContainer = document.querySelector(".app");
    if (appContainer) {
        appContainer.appendChild(modal);
    } else {
        document.body.appendChild(modal);
    }

    modal.querySelector(".modal-close").addEventListener("click", closeModal);
    modal.querySelector(".modal-overlay").addEventListener("click", event => {
        if (event.target === modal.querySelector(".modal-overlay")) {
            closeModal();
        }
    });
}

function openModal(content) {
    const modal = document.getElementById("clientflow-modal");
    if (!modal) return;

    const contentBox = modal.querySelector("#modal-content");
    if (!contentBox) return;

    contentBox.innerHTML = content;
    modal.classList.add("show");

    setTimeout(() => {
        const firstInput = contentBox.querySelector("input, select");
        if (firstInput) firstInput.focus();
    }, 100);
}

function closeModal() {
    const modal = document.getElementById("clientflow-modal");
    if (!modal) return;
    modal.classList.remove("show");
}

// ============================================================
// CONFIRM DELETE
// ============================================================

function confirmDelete(title, message, callback) {
    openModal(`
        <div class="confirm-modal">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(message)}</p>
            <div class="confirm-actions">
                <button class="secondary-btn" id="cancel-confirm" type="button">Отмена</button>
                <button class="danger-action-btn" id="confirm-action" type="button">Удалить</button>
            </div>
        </div>
    `);

    document.getElementById("cancel-confirm").addEventListener("click", closeModal);
    document.getElementById("confirm-action").addEventListener("click", async function () {
        try {
            await callback();
            closeModal();
        } catch (error) {
            showError(error.message);
        }
    });
}

// ============================================================
// ERROR DISPLAY
// ============================================================

function showError(message) {
    console.error("ClientFlow error:", message);

    const existing = document.getElementById("clientflow-error");
    if (existing) existing.remove();

    const error = document.createElement("div");
    error.id = "clientflow-error";
    error.textContent = message || "Произошла ошибка";

    error.style.position = "fixed";
    error.style.left = "16px";
    error.style.right = "16px";
    error.style.bottom = "20px";
    error.style.zIndex = "99999";
    error.style.padding = "14px 16px";
    error.style.borderRadius = "12px";
    error.style.background = "#dc2626";
    error.style.color = "#ffffff";
    error.style.fontSize = "14px";
    error.style.boxShadow = "0 8px 30px rgba(0,0,0,.2)";

    document.body.appendChild(error);
    setTimeout(() => { error.remove(); }, 4000);
}

// ============================================================
// GLOBAL CLICK HANDLER
// ============================================================

document.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "edit-client") openClientEditForm(id);
    if (action === "archive-client") archiveClient(id);
    if (action === "restore-client") restoreClient(id);
    if (action === "delete-client") {
        confirmDelete("Удалить клиента?", "Клиент будет удалён окончательно.", () => deleteClient(id));
    }
    if (action === "edit-appointment") openAppointmentEditForm(id);
    if (action === "pay-appointment") payAppointment(id);
    if (action === "delete-appointment") {
        confirmDelete("Удалить запись?", "Запись будет удалена окончательно.", () => deleteAppointment(id));
    }
    if (action === "edit-invoice") openInvoiceEditForm(id);
    if (action === "toggle-invoice") toggleInvoice(id);
    if (action === "delete-invoice") {
        confirmDelete("Удалить счёт?", "Счёт будет удалён окончательно.", () => deleteInvoice(id));
    }
});

// ============================================================
// NAVIGATION EVENTS
// ============================================================

document.querySelectorAll(".nav-btn").forEach(button => {
    button.addEventListener("click", () => {
        window.haptic("light");
        openScreen(button.dataset.screen);
    });
});

document.querySelectorAll(".action-card").forEach(button => {
    button.addEventListener("click", () => {
        window.haptic("light");
        openScreen(button.dataset.screen);
    });
});

// ============================================================
// CALENDAR EVENTS
// ============================================================

document.getElementById("calendar-prev")?.addEventListener("click", () => changeCalendarMonth(-1));
document.getElementById("calendar-next")?.addEventListener("click", () => changeCalendarMonth(1));
document.getElementById("calendar-today")?.addEventListener("click", function () {
    const current = new Date();
    calendarYear = current.getFullYear();
    calendarMonth = current.getMonth();
    selectedDate = getTodayDate();
    renderCalendar();
    renderAppointments();
});

// ============================================================
// ADD BUTTONS
// ============================================================

document.querySelectorAll(".add-btn").forEach(button => {
    button.addEventListener("click", function () {
        const type = button.dataset.add;
        if (type === "client") openClientForm();
        if (type === "appointment") openAppointmentForm();
        if (type === "invoice") openInvoiceForm();
    });
});

// ============================================================
// INITIALIZATION
// ============================================================

async function initializeClientFlow() {
    createModal();

    try {
        await authenticate();
        await loadAllData();

        renderDashboard();
        renderClients();
        renderCalendar();
        renderAppointments();
        renderInvoices();

        console.log("ClientFlow initialized successfully");
        console.log("Clients:", clientFlowData.clients.length);
        console.log("Appointments:", clientFlowData.appointments.length);
        console.log("Invoices:", clientFlowData.invoices.length);
    } catch (error) {
        console.error("ClientFlow initialization failed:", error);
        showError(error.message || "Не удалось загрузить ClientFlow");
    }
}

// ============================================================
// START
// ============================================================

initializeClientFlow();