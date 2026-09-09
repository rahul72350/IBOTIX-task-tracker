"""
Run with:  python -m app.seed
Creates ONLY the accounts below — no demo projects, processes, tickets,
or any other business data. Safe to re-run: existing accounts have their
password reset to match below rather than erroring.
"""

from app.db import query
from app.auth import hash_password

ACCOUNTS = [
    # (full_name, email, password, role, department_name)
    ("Neeraj",   "neeraj@ibotix.ai",   "Neeraj@123",   "super_admin", None),
    ("Suyash",   "suyash@ibotix.ai",   "Suyash@123",   "department_admin", "Post Sales BA"),
    ("Ujjwal",   "ujjwal@ibotix.ai",   "Ujjwal@123",   "department_admin", "Pre Sales BA"),
    ("Gourav",   "gourav@ibotix.ai",   "Gourav@123",   "department_admin", "RPA"),
    ("Bhumika",  "bhumika@ibotix.ai",  "Bhumika@123",  "department_admin", "Data Science"),
    ("Pratigya", "pratigya@ibotix.ai", "Pratigya@123", "department_admin", "HR OPS TEAM"),
    ("Shrishti", "shrishti@ibotix.ai", "Shrishti@123", "department_admin", "HR OPS"),
    # General team members — one per department so assignment dropdowns
    # always have someone to pick, every department covered.
    ("Priya",    "priya@ibotix.ai",    "Priya@123",    "user", "Pre Sales BA"),
    ("Rahul",    "rahul@ibotix.ai",    "Rahul@123",    "user", "Post Sales BA"),
    ("Ritika",   "ritika@ibotix.ai",   "Ritika@123",   "user", "HR OPS TEAM"),
    ("Varsha",   "varsha@ibotix.ai",   "Varsha@123",   "user", "HR OPS"),
    ("Aniket",   "aniket@ibotix.ai",   "Aniket@123",   "user", "Data Science"),
    ("Anshul",   "anshul@ibotix.ai",   "anshul@123",   "user", "RPA"),
    # A dedicated super admin whose sole distinguishing power is marking
    # a project Completed — see PROJECT_COMPLETER_EMAIL in
    # app/routers/projects.py, which this email must match exactly.
    ("Manager",  "manager@ibotix.ai",  "manager@123",  "super_admin", None),
]


def main():
    departments = {d["name"]: d["id"] for d in query("select id, name from departments")}
    admin_designation_id = query("select id from designations where name = 'Department Admin'")[0]["id"]

    for full_name, email, password, role, dept_name in ACCOUNTS:
        department_id = departments[dept_name] if dept_name else None
        # Only a department_admin gets the "Department Admin" designation —
        # a general user's designation is optional and picked separately
        # (via Configure), not implied by having a department.
        designation_id = admin_designation_id if role == "department_admin" else None
        pw_hash = hash_password(password)
        existing = query("select id from users where lower(email) = lower(%s)", [email])

        if existing:
            query(
                """update users set password_hash = %s, role = %s, status = 'active',
                                    email_verified = true, department_id = %s
                    where id = %s""",
                [pw_hash, role, department_id, existing[0]["id"]],
            )
            print(f"Updated: {email} ({role})")
        else:
            query(
                """insert into users (full_name, email, password_hash, designation_id, department_id, role, status, email_verified)
                   values (%s,%s,%s,%s,%s,%s,'active',true)""",
                [full_name, email, pw_hash, designation_id, department_id, role],
            )
            print(f"Created: {email} ({role}{' — ' + dept_name if dept_name else ''})")

    print("\nDone. Only these accounts exist — no demo projects, processes, or tickets were created.")
    print("Sign in and build everything else yourself from here.")


if __name__ == "__main__":
    main()
